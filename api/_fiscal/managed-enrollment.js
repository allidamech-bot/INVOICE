import {createHash,X509Certificate,randomBytes,verify} from 'node:crypto';
import {simulationBase,readSimulationContext} from './simulation-scope.js';
import {createManagedSimulationCsr,verifyManagedSimulationCsr,createSoftHsmStagingCsr,verifySoftHsmStagingCsr} from './managed-csr.js';
import {requiredComplianceChecks} from './onboarding.js';
import {requireProtectedSigningSession} from './protected-signing.js';
import {FIRST_PREVIOUS_INVOICE_HASH} from '../../dist/src/lib/fiscal-issuance.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const data=s=>s.exists?s.data():null;
const same=(a,b)=>a&&b&&['environment','accountUid','workspaceId','egsId'].every(k=>a[k]===b[k]);
function need(ok,code='EGS_ENROLLMENT_FORBIDDEN'){if(!ok)throw Error(code);}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
const digest=v=>sha(Buffer.from(JSON.stringify(canonical(v))));
function approvedConfig(v,s){
  need(same(v,s)&&v.state==='approved'&&v.issuer&&v.unit&&v.keyBinding&&same(v.keyBinding,s)&&v.unit.egsId===s.egsId&&v.pilotAuthorized===true);
  requiredComplianceChecks(v.unit.functionalityMap);return v;
}
function profile(s,c,result){
  return {...s,state:'approved',issuer:c.issuer,unit:c.unit,keyBinding:c.keyBinding,functionalityMap:c.unit.functionalityMap,configDigest:digest(c),...result};
}
function checkedProfile(p,c,s,verifyCsr=verifyManagedSimulationCsr){
  need(same(p,s)&&p.state==='approved'&&p.configDigest===digest(c)&&digest(p.issuer)===digest(c.issuer)&&digest(p.unit)===digest(c.unit)&&digest(p.keyBinding)===digest(c.keyBinding)&&p.functionalityMap===c.unit.functionalityMap&&typeof p.csr==='string'&&p.csr.length<=45000);
  const bytes=Buffer.from(p.csr,'base64');need(bytes.toString('base64')===p.csr&&sha(bytes)===p.csrDigest&&verifyCsr({scope:s,issuer:c.issuer,unit:c.unit,binding:c.keyBinding,csr:bytes,publicKey:p.publicKey}),'EGS_CSR_INVALID');return p;
}
// Admin-only commands. Configuration is provisioned and approved separately;
// no user-supplied profile, key, VAT or trust pin is accepted here.
function createLifecycle({db,resolveSigner,vault,resolveProtectedSession,clock=()=>new Date().toISOString()},softwareStaging){
  const createCsr=softwareStaging?createSoftHsmStagingCsr:createManagedSimulationCsr;
  const verifyCsr=softwareStaging?verifySoftHsmStagingCsr:verifyManagedSimulationCsr;
  const check=(p,c,s)=>checkedProfile(p,c,s,verifyCsr);
  need(typeof db?.runTransaction==='function'&&typeof db?.doc==='function'&&typeof resolveSigner==='function'&&typeof vault?.load==='function'&&typeof resolveProtectedSession==='function','EGS_RUNTIME_UNAVAILABLE');
  const refs=s=>{const base=simulationBase(s),unit=base+'/egs/'+s.egsId;return {unit:db.doc(unit),config:db.doc(unit+'/enrollment/config'),approved:db.doc(unit+'/enrollment/approved'),current:db.doc(unit+'/onboarding/current'),attempt:k=>db.doc(unit+'/enrollmentAttempts/'+k),credential:r=>db.doc(unit+'/simulationCredentials/'+r),activation:db.doc(unit+'/enrollment/activation')};};
  async function snapshot(tx,s,r){
    const {workspace,unit}=await readSimulationContext(db,tx,s);
    need(workspace.commandsEnabled===true&&workspace.selectedEgsId===s.egsId);
    const c=approvedConfig(data(await tx.get(r.config)),s),p=data(await tx.get(r.approved));
    return {unit,c,p};
  }
  return Object.freeze({
    async prepareCsr(s){
      const r=refs(s),initial=await db.runTransaction(tx=>snapshot(tx,s,r));need(initial.unit.active===false);
      if(initial.p){const p=check(initial.p,initial.c,s);return {state:'csr-ready',csrDigest:p.csrDigest};}
      const signer=await resolveSigner(s,structuredClone(initial.c.keyBinding));
      const result=await createCsr({scope:s,issuer:initial.c.issuer,unit:initial.c.unit,binding:initial.c.keyBinding,signer});
      return db.runTransaction(async tx=>{
        const {c,p,unit}=await snapshot(tx,s,r);need(unit.active===false&&digest(c)===digest(initial.c),'EGS_CONFIG_CHANGED');
        if(p){const prior=check(p,c,s);return {state:'csr-ready',csrDigest:prior.csrDigest};}
        const next=profile(s,c,result);check(next,c,s);tx.create(r.approved,next);return {state:'csr-ready',csrDigest:next.csrDigest};
      });
    },
    async verifyCsr({scope:s,issuer,keyBinding,csr,functionalityMap}){
      const r=refs(s),{unit,c,p}=await db.runTransaction(tx=>snapshot(tx,s,r));
      need(unit.active===false);const a=check(p,c,s);
      return digest(issuer)===digest(a.issuer)&&digest(keyBinding)===digest(a.keyBinding)&&functionalityMap===a.functionalityMap&&Buffer.isBuffer(csr)&&csr.equals(Buffer.from(a.csr,'base64'));
    },
    async activate(s){
      const r=refs(s);
      async function read(tx){
        const {unit,c,p}=await snapshot(tx,s,r),a=check(p,c,s);
        const current=data(await tx.get(r.current)),prior=data(await tx.get(r.activation));
        need(current?.state==='operational-recorded'&&same(current.binding,s)&&current.csrDigest===a.csrDigest&&current.functionalityMap===a.functionalityMap&&Number.isSafeInteger(current.version)&&current.version>=1);
        const types=requiredComplianceChecks(a.functionalityMap);
        need(Array.isArray(current.checks)&&current.checks.length===types.length&&types.every(t=>current.checks.filter(x=>x.type===t&&x.outcome==='verified-pass'&&/^[a-f0-9]{64}$/.test(x.artifactDigest)&&/^[a-f0-9]{64}$/.test(x.responseDigest)).length===1)&&new Set(current.checks.map(x=>x.artifactDigest)).size===types.length);
        for(const k of ['compliance-csid',...types.map(t=>'check-'+t),'operational-csid']){const attempt=data(await tx.get(r.attempt(k)));need(same(attempt,s)&&attempt.state==='completed','EGS_ENROLLMENT_UNRESOLVED');}
        const ref=current.operationalCredentialRef;
        need(typeof ref==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(ref)&&/^[a-f0-9]{64}$/.test(current.operationalCertificateDigest));
        const envelope=data(await tx.get(r.credential(ref)));need(same(envelope,s)&&envelope.kind==='production'&&envelope.ref===ref&&envelope.version===1);
        if(unit.active===true){need(same(prior,s)&&prior.state==='active'&&prior.csrDigest===a.csrDigest&&prior.credentialRef===ref&&prior.onboardingVersion===current.version,'EGS_ACTIVATION_CONFLICT');}
        else need(unit.active===false&&!prior&&(unit.nextIcv===undefined||unit.nextIcv==='1')&&(unit.previousInvoiceHash===undefined||unit.previousInvoiceHash===FIRST_PREVIOUS_INVOICE_HASH),'EGS_ACTIVATION_CONFLICT');
        return {unit,c,a,current,prior,ref,envelope};
      }
      const initial=await db.runTransaction(read);
      if(initial.prior)return {state:'active',environment:'simulation'};
      const credential=await vault.load(s,initial.ref,'production');
      need(same(credential,s)&&credential.kind==='production'&&sha(credential.binarySecurityToken)===initial.current.operationalCertificateDigest&&credential.requestId===initial.current.operationalRequestId,'EGS_CREDENTIAL_MISMATCH');
      // Independently verify the certificate chain, current revocation and HSM
      // binding using the existing protected signing implementation. Require
      // an actual proof-of-possession signature, not an adapter boolean.
      const session=requireProtectedSigningSession(await resolveProtectedSession(s,structuredClone(initial.a.issuer),structuredClone(initial.a.keyBinding),structuredClone(credential)));
      need(same(session.scope,s)&&session.issuerVat===initial.a.issuer.vatNumber);
      const leaf=new X509Certificate(session.chainDer[0]),token=Buffer.from(credential.binarySecurityToken,'base64');
      let issued;try{issued=new X509Certificate(token);}catch{throw Error('EGS_CERTIFICATE_INVALID');}
      need(issued.raw.equals(leaf.raw)&&sha(leaf.publicKey.export({type:'spki',format:'der'}))===initial.a.keyBinding.publicKeyDigest,'EGS_CERTIFICATE_MISMATCH');
      const proof=randomBytes(32),signature=await session.sign('xades-signed-info',proof);
      need(verify('sha256',proof,{key:leaf.publicKey,dsaEncoding:'ieee-p1363'},signature),'EGS_KEY_PROOF_FAILED');
      const at=clock();need(typeof at==='string'&&Number.isFinite(Date.parse(at))&&new Date(at).toISOString()===at&&Date.parse(at)>=Date.parse(session.at)&&Date.parse(at)-Date.parse(session.at)<=300000,'EGS_ACTIVATION_TIME_INVALID');
      return db.runTransaction(async tx=>{
        const v=await read(tx);
        need(digest(v.c)===digest(initial.c)&&digest(v.a)===digest(initial.a)&&digest(v.current)===digest(initial.current)&&digest(v.envelope)===digest(initial.envelope),'EGS_CONFIG_CHANGED');
        if(v.prior)return {state:'active',environment:'simulation'};
        tx.create(r.activation,{...s,state:'active',csrDigest:v.a.csrDigest,credentialRef:v.ref,onboardingVersion:v.current.version,leafDigest:sha(leaf.raw),publicKeyDigest:v.a.keyBinding.publicKeyDigest,activatedAt:at});
        tx.update(r.unit,{active:true,nextIcv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH,operationalCredentialRef:v.ref,certificateDigest:sha(leaf.raw),issuerVat:v.a.issuer.vatNumber});
        return {state:'active',environment:'simulation'};
      });
    }
  });
}

export const createManagedEnrollmentLifecycle=options=>createLifecycle(options,false);
export const createStagingEnrollmentLifecycle=options=>createLifecycle(options,true);
