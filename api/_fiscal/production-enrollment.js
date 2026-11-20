import {createHash,randomUUID,randomBytes,X509Certificate,verify} from 'node:crypto';
import {createManagedProductionCsr,verifyManagedProductionCsr} from './managed-csr.js';
import {createProductionOnboardingStore} from './onboarding-store.js';
import {createZatcaProductionClient} from './zatca-simulation.js';
import {requiredComplianceChecks} from './onboarding.js';
import {normalizeSdk4Proof} from './sdk4-local-validator.js';
import {verifiedComplianceReceipt} from './production-compliance-input.js';
import {requireProtectedSigningSession} from './protected-signing.js';

// Private production coordinator. All external adapters must be independently
// configured and verified by the hosting service; never a client option.
const ID=/^[A-Za-z0-9_-]{1,128}$/,HEX=/^[a-f0-9]{64}$/;
const sha=v=>createHash('sha256').update(v).digest('hex');
const data=s=>s.exists?s.data():null;
const keys=['accountUid','workspaceId','egsId','environment'];
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digestObject=v=>sha(JSON.stringify(canonical(v)));
const same=(a,b)=>a&&b&&keys.every(k=>a[k]===b[k]);
function need(ok,code='PRODUCTION_ENROLLMENT_FORBIDDEN'){if(!ok)throw Error(code);}
function id(v){return typeof v==='string'&&ID.test(v);}
function bytes(v,max){need(typeof v==='string'&&v.length<=Math.ceil(max/3)*4);const b=Buffer.from(v,'base64');need(b.length>0&&b.length<=max&&b.toString('base64')===v);return b;}
function command(identity,input,extra=[]){
  need(identity?.role==='owner'&&id(identity.uid)&&input&&Object.keys(input).length===2+extra.length&&id(input.workspaceId)&&id(input.egsId)&&extra.every(k=>Object.hasOwn(input,k)));
  return Object.freeze({accountUid:identity.uid,workspaceId:input.workspaceId,egsId:input.egsId,environment:'production'});
}
function checkCsr(u,s){need(typeof u.csr==='string'&&HEX.test(u.csrDigest)&&sha(bytes(u.csr,32768))===u.csrDigest&&verifyManagedProductionCsr({scope:s,issuer:u.issuer,unit:u.unit,binding:u.binding,csr:bytes(u.csr,32768),publicKey:u.publicKey}),'PRODUCTION_CSR_NOT_VERIFIED');}
function checkLeaf(credential,u,s,kind){
  need(same(credential,s)&&credential.kind===kind&&Number.isSafeInteger(credential.requestId)&&credential.requestId>0,'PRODUCTION_CERTIFICATE_NOT_VERIFIED');
  let leaf;try{leaf=new X509Certificate(bytes(credential.binarySecurityToken,32768));}catch{throw Error('PRODUCTION_CERTIFICATE_NOT_VERIFIED');}
  need(leaf.publicKey.asymmetricKeyType==='ec'&&leaf.publicKey.asymmetricKeyDetails?.namedCurve==='secp256k1'&&sha(leaf.publicKey.export({type:'spki',format:'der'}))===u.binding.publicKeyDigest,'PRODUCTION_CERTIFICATE_KEY_MISMATCH');
  return sha(leaf.raw);
}
export function createProductionEnrollment({db,authority,vault,resolveSigner,resolveProtectedSession,verifyCredential,buildComplianceInvoice,sdkManifestSha256,fetchImpl,makeId=randomUUID,clock=()=>new Date().toISOString()}){
  need(typeof db?.runTransaction==='function'&&typeof db?.doc==='function'&&['readUnit','recordCsr','reserveAttempt','operationAuthorizer','recordResult'].every(k=>typeof authority?.[k]==='function')&&['store','load'].every(k=>typeof vault?.[k]==='function')&&[resolveSigner,resolveProtectedSession,verifyCredential,buildComplianceInvoice,makeId,clock].every(f=>typeof f==='function'),'PRODUCTION_ENROLLMENT_UNAVAILABLE');
  need(HEX.test(sdkManifestSha256??''),'PRODUCTION_ENROLLMENT_UNAVAILABLE');
  const store=createProductionOnboardingStore({db,vault,readUnit:authority.readUnit});
  const root=s=>'fiscalProductionV1/'+s.accountUid+'/workspaces/'+s.workspaceId+'/egs/'+s.egsId;
  const slots=u=>['compliance-csid',...requiredComplianceChecks(u.unit.functionalityMap).map(t=>'check-'+t),'operational-csid'];
  async function readEnrollment(tx,s){
      const u=await authority.readUnit(tx,s),current=data(await tx.get(db.doc(root(s)+'/onboarding/current')));
      if(current)need(same(current.binding,s)&&current.csrDigest===u.csrDigest&&current.functionalityMap===u.unit.functionalityMap,'PRODUCTION_ONBOARDING_STALE');
      const attempts={};
      for(const k of slots(u)){
        const a=data(await tx.get(db.doc(root(s)+'/authorityAttempts/'+k)));
        if(a){need(same(a,s)&&a.slot===k&&['reserved','dispatched','completed'].includes(a.state));attempts[k]=a;}
      }
      return {u,current,attempts,held:Object.values(attempts).some(a=>a.state!=='completed')};
  }
  async function load(s){return db.runTransaction(tx=>readEnrollment(tx,s));}
  function projection(v){
    const {u,current,held}=v;return {environment:'production',workspaceId:u.workspaceId,egsId:u.egsId,branchId:u.branchId,unitActive:u.state==='active',enrollmentHeld:held,state:current?.state??'not-started',version:current?.version??0,passed:current?.checks.filter(x=>x.outcome==='verified-pass').length??0,required:requiredComplianceChecks(u.unit.functionalityMap).length};
  }
  function client(s,slot){return createZatcaProductionClient({environment:'production',authorizedScope:s,authorizeOperation:authority.operationAuthorizer(s,slot),fetchImpl});}
  function ref(prefix){const value=makeId();need(id(value)&&value.length<=100);return prefix+'-'+value;}
  async function verifyCertificate(scope,u,credential,kind){
    const digest=checkLeaf(credential,u,scope,kind);
    need(await verifyCredential({scope,kind,credential:structuredClone(credential),profile:structuredClone(u)})===true,'PRODUCTION_CERTIFICATE_NOT_VERIFIED');
    return digest;
  }
  function assertStage(v,expected,state){
    need(v.u.state==='enrolling'&&!v.held,'PRODUCTION_ATTEMPT_HELD');need(v.current?.state===state&&v.current.version===expected,'STALE_ONBOARDING');
  }
  return Object.freeze({
    async inspect(identity,input){return projection(await load(command(identity,input)));},
    async begin(identity,input){
      const s=command(identity,input,['otp']);need(typeof input.otp==='string'&&/^\d{6}$/.test(input.otp),'INVALID_OTP');
      let v=await load(s);need(v.u.state==='enrolling'&&!v.current&&!v.held&&!v.attempts['compliance-csid'],'PRODUCTION_ATTEMPT_HELD');
      if(!v.u.csrDigest){const signer=await resolveSigner(s,structuredClone(v.u.binding));const csr=await createManagedProductionCsr({scope:s,issuer:v.u.issuer,unit:v.u.unit,binding:v.u.binding,signer});await authority.recordCsr(s,csr);v=await load(s);}
      checkCsr(v.u,s);
      const slot='compliance-csid';
      await authority.reserveAttempt(slot,{scope:s,operation:slot,csrDigest:v.u.csrDigest});
      const credential=await client(s,slot).requestCompliance({otp:input.otp,csr:v.u.csr});
      const digest=await verifyCertificate(s,v.u,credential,'compliance'),credentialRef=ref('compliance');
      await vault.store(s,credentialRef,credential);
      await store.start(s,{functionalityMap:v.u.unit.functionalityMap,credentialRef,csrDigest:v.u.csrDigest});
      await authority.recordResult(s,slot,{digest,outcome:'verified-pass'});
      return projection(await load(s));
    },
    async check(identity,input){
      const s=command(identity,input,['expectedVersion']),v=await load(s);
      assertStage(v,input.expectedVersion,'checking');checkCsr(v.u,s);
      const type=requiredComplianceChecks(v.u.unit.functionalityMap).find(t=>!v.current.checks.some(x=>x.type===t));need(type,'COMPLIANCE_ALREADY_COMPLETE');
      const mode=type.startsWith('standard-')?'clearance':'reporting',slot='check-'+type;
      const credential=await vault.load(s,v.current.credentialRef,'compliance');
      need(same(credential,s)&&sha(credential.binarySecurityToken)===v.current.binding.certificateDigest&&credential.requestId===v.current.binding.requestId,'COMPLIANCE_BINDING_MISMATCH');
      await verifyCertificate(s,v.u,credential,'compliance');
      const candidateRef=db.doc(root(s)+'/complianceCandidates/'+type);
      // A crash before reservation does not authorize another invoice identity.
      // Reuse the persisted SDK-validated bytes only when no attempt exists.
      let candidate=await db.runTransaction(async tx=>{const latest=await readEnrollment(tx,s);assertStage(latest,v.current.version,'checking');return data(await tx.get(candidateRef));});
      if(!candidate){
        const built=await buildComplianceInvoice({scope:s,type,profile:structuredClone(v.u),credential:structuredClone(credential)});
        need(built?.type===type&&built.mode===mode&&built.verifiedByOfficialSdk===true&&built.onboardingVersion===v.current.version,'PRODUCTION_COMPLIANCE_ARTIFACT_NOT_VERIFIED');
        const xml=bytes(built.invoice,512*1024),artifactDigest=sha(xml);
        const proof=normalizeSdk4Proof(built.sdkProof,{uuid:built.uuid,mode,artifactDigest});
        need(proof.kind===type&&proof.installationManifestSha256===sdkManifestSha256,'PRODUCTION_COMPLIANCE_ARTIFACT_NOT_VERIFIED');
        const next={...s,type,mode,uuid:built.uuid,icv:built.icv,number:built.number,issueDate:built.issueDate,invoiceHash:built.invoiceHash,artifactDigest,credentialRequestId:credential.requestId,onboardingVersion:v.current.version,invoice:built.invoice,sdkProof:proof};
        candidate=await db.runTransaction(async tx=>{
          const latest=await readEnrollment(tx,s);assertStage(latest,v.current.version,'checking');
          const prior=data(await tx.get(candidateRef));if(prior)return prior;
          tx.create(candidateRef,next);return next;
        });
      }
      const xml=bytes(candidate.invoice,512*1024),artifactDigest=sha(xml);
      need(same(candidate,s)&&candidate.type===type&&candidate.mode===mode&&candidate.onboardingVersion===v.current.version&&candidate.credentialRequestId===credential.requestId&&candidate.artifactDigest===artifactDigest,'PRODUCTION_COMPLIANCE_ARTIFACT_NOT_VERIFIED');
      const proof=normalizeSdk4Proof(candidate.sdkProof,{uuid:candidate.uuid,mode,artifactDigest});
      need(proof.kind===type&&proof.installationManifestSha256===sdkManifestSha256,'PRODUCTION_COMPLIANCE_ARTIFACT_NOT_VERIFIED');
      await authority.reserveAttempt(slot,{scope:s,operation:'compliance-check',mode,uuid:candidate.uuid,invoiceHash:candidate.invoiceHash,artifactDigest,credentialRequestId:credential.requestId});
      const response=await client(s,slot).checkCompliance(credential,{uuid:candidate.uuid,invoiceHash:candidate.invoiceHash,invoice:candidate.invoice},mode);
      const outcome=verifiedComplianceReceipt({mode,httpStatus:response.httpStatus,bytes:response.evidenceBytes,evidenceDigest:response.evidenceDigest});
      need(outcome==='verified-pass'&&response.status==='compliance-response','PRODUCTION_COMPLIANCE_UNRESOLVED');
      need(sha(response.evidenceBytes)===response.evidenceDigest,'PRODUCTION_COMPLIANCE_UNRESOLVED');
      await store.recordCheck(s,v.current.version,{type,outcome,artifactBytes:xml,responseBytes:response.evidenceBytes});
      await authority.recordResult(s,slot,{digest:response.evidenceDigest,outcome});
      return projection(await load(s));
    },
    async operational(identity,input){
      const s=command(identity,input,['expectedVersion']),v=await load(s);
      assertStage(v,input.expectedVersion,'checks-complete');checkCsr(v.u,s);
      const compliance=await vault.load(s,v.current.credentialRef,'compliance');
      await verifyCertificate(s,v.u,compliance,'compliance');
      const slot='operational-csid';
      await authority.reserveAttempt(slot,{scope:s,operation:slot,credentialRequestId:compliance.requestId,onboardingVersion:v.current.version});
      const attempt=ref('attempt'),claimed=await store.claimOperational(s,v.current.version,attempt);
      const credential=await client(s,slot).requestProductionCsid(compliance,claimed.record);
      const digest=await verifyCertificate(s,v.u,credential,'production'),credentialRef=ref('operational');
      await vault.store(s,credentialRef,credential);
      await store.recordOperational(s,claimed.version,attempt,credentialRef);
      await authority.recordResult(s,slot,{digest,outcome:'verified-pass'});
      // Recording a live CSID never activates the unit. A separate verified
      // protected signing session and irreversible activation transaction follow.
      return projection(await load(s));
    },
    async activate(identity,input){
      const s=command(identity,input,['expectedVersion']);
      const unitRef=db.doc(root(s)),activationRef=db.doc(root(s)+'/enrollment/activation');
      // Read and compare all exact enrollment evidence before and after the
      // hardware proof. A certificate receipt alone never enables issuance.
      const read=async tx=>{
        const v=await readEnrollment(tx,s),c=v.current,u=v.u,required=requiredComplianceChecks(u.unit.functionalityMap);
        checkCsr(u,s);
        need(c?.state==='operational-recorded'&&c.version===input.expectedVersion&&Number.isSafeInteger(c.version)&&c.version>0&&!v.held&&c.checks.length===required.length&&required.every(t=>c.checks.filter(x=>x.type===t&&x.outcome==='verified-pass'&&HEX.test(x.artifactDigest)&&HEX.test(x.responseDigest)).length===1)&&new Set(c.checks.map(x=>x.artifactDigest)).size===required.length,'PRODUCTION_ACTIVATION_NOT_READY');
        for(const k of slots(u)){const a=v.attempts[k];need(same(a,s)&&a.state==='completed'&&a.evidence?.outcome==='verified-pass'&&HEX.test(a.evidence.digest),'PRODUCTION_ACTIVATION_NOT_READY');}
        for(const x of c.checks)need(v.attempts['check-'+x.type].evidence.digest===x.responseDigest&&v.attempts['check-'+x.type].claim.artifactDigest===x.artifactDigest,'PRODUCTION_ACTIVATION_EVIDENCE_MISMATCH');
        need(id(c.operationalCredentialRef)&&HEX.test(c.operationalCertificateDigest)&&Number.isSafeInteger(c.operationalRequestId)&&c.operationalRequestId>0,'PRODUCTION_ACTIVATION_NOT_READY');
        const env=data(await tx.get(db.doc(root(s)+'/productionCredentials/'+c.operationalCredentialRef))),prior=data(await tx.get(activationRef));
        need(same(env,s)&&env.kind==='production'&&env.ref===c.operationalCredentialRef&&env.version===1,'PRODUCTION_ACTIVATION_NOT_READY');
        if(u.state==='active')need(same(prior,s)&&prior.state==='active'&&prior.onboardingVersion===c.version&&prior.csrDigest===u.csrDigest&&prior.credentialRef===c.operationalCredentialRef&&prior.leafDigest===v.attempts['operational-csid'].evidence.digest&&u.operationalCredentialRef===prior.credentialRef&&u.certificateDigest===prior.leafDigest,'PRODUCTION_ACTIVATION_CONFLICT');
        else need(u.state==='enrolling'&&!prior&&u.nextIcv===undefined&&u.previousInvoiceHash===undefined,'PRODUCTION_ACTIVATION_CONFLICT');
        return {v,env,prior};
      };
      const initial=await db.runTransaction(read);
      if(initial.prior)return projection(initial.v);
      const {u,current,attempts}=initial.v,credential=await vault.load(s,current.operationalCredentialRef,'production');
      const leafDigest=await verifyCertificate(s,u,credential,'production');
      need(credential.requestId===current.operationalRequestId&&sha(credential.binarySecurityToken)===current.operationalCertificateDigest&&leafDigest===attempts['operational-csid'].evidence.digest,'PRODUCTION_ACTIVATION_EVIDENCE_MISMATCH');
      const session=requireProtectedSigningSession(await resolveProtectedSession(s,structuredClone(u),structuredClone(credential)));
      need(same(session.scope,s)&&session.issuerVat===u.issuer.vatNumber,'PRODUCTION_ACTIVATION_SESSION_MISMATCH');
      const leaf=new X509Certificate(session.chainDer[0]);
      need(sha(leaf.raw)===leafDigest&&sha(leaf.publicKey.export({type:'spki',format:'der'}))===u.binding.publicKeyDigest,'PRODUCTION_ACTIVATION_SESSION_MISMATCH');
      const challenge=randomBytes(32),signature=await session.sign('xades-signed-info',challenge);
      need(verify('sha256',challenge,{key:leaf.publicKey,dsaEncoding:'ieee-p1363'},signature),'PRODUCTION_ACTIVATION_KEY_PROOF_FAILED');
      const at=clock();need(typeof at==='string'&&Number.isFinite(Date.parse(at))&&new Date(at).toISOString()===at&&Date.parse(at)>=Date.parse(session.at)&&Date.parse(at)-Date.parse(session.at)<=300000,'PRODUCTION_ACTIVATION_TIME_INVALID');
      // Reuse the compiled audited fiscal sequence constant. No new sequence
      // convention or historical ICV reset is introduced by live activation.
      const {FIRST_PREVIOUS_INVOICE_HASH}=await import('../../dist/src/lib/fiscal-issuance.js');
      need(typeof FIRST_PREVIOUS_INVOICE_HASH==='string'&&FIRST_PREVIOUS_INVOICE_HASH.length>0,'PRODUCTION_ACTIVATION_NOT_READY');
      await db.runTransaction(async tx=>{
        const latest=await read(tx);
        need(digestObject(latest)===digestObject(initial),'PRODUCTION_ACTIVATION_CHANGED');
        tx.create(activationRef,{...s,state:'active',onboardingVersion:current.version,csrDigest:u.csrDigest,credentialRef:current.operationalCredentialRef,leafDigest,publicKeyDigest:u.binding.publicKeyDigest,activatedAt:at});
        tx.update(unitRef,{state:'active',nextIcv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH,operationalCredentialRef:current.operationalCredentialRef,certificateDigest:leafDigest,issuerVat:u.issuer.vatNumber});
      });
      return projection(await load(s));
    }
  });
}
