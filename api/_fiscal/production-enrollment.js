import {createHash,randomUUID,X509Certificate} from 'node:crypto';
import {createManagedProductionCsr,verifyManagedProductionCsr} from './managed-csr.js';
import {createProductionOnboardingStore} from './onboarding-store.js';
import {createZatcaProductionClient} from './zatca-simulation.js';
import {requiredComplianceChecks} from './onboarding.js';

// Private production coordinator. All external adapters must be independently
// configured and verified by the hosting service; never a client option.
const ID=/^[A-Za-z0-9_-]{1,128}$/,HEX=/^[a-f0-9]{64}$/;
const sha=v=>createHash('sha256').update(v).digest('hex');
const data=s=>s.exists?s.data():null;
const keys=['accountUid','workspaceId','egsId','environment'];
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
export function createProductionEnrollment({db,authority,vault,resolveSigner,verifyCredential,buildComplianceInvoice,verifyComplianceResult,fetchImpl,makeId=randomUUID}){
  need(typeof db?.runTransaction==='function'&&typeof db?.doc==='function'&&['readUnit','recordCsr','reserveAttempt','operationAuthorizer','recordResult'].every(k=>typeof authority?.[k]==='function')&&['store','load'].every(k=>typeof vault?.[k]==='function')&&[resolveSigner,verifyCredential,buildComplianceInvoice,verifyComplianceResult,makeId].every(f=>typeof f==='function'),'PRODUCTION_ENROLLMENT_UNAVAILABLE');
  const store=createProductionOnboardingStore({db,vault,readUnit:authority.readUnit});
  const root=s=>'fiscalProductionV1/'+s.accountUid+'/workspaces/'+s.workspaceId+'/egs/'+s.egsId;
  const slots=u=>['compliance-csid',...requiredComplianceChecks(u.unit.functionalityMap).map(t=>'check-'+t),'operational-csid'];
  async function load(s){
    return db.runTransaction(async tx=>{
      const u=await authority.readUnit(tx,s),current=data(await tx.get(db.doc(root(s)+'/onboarding/current')));
      if(current)need(same(current.binding,s)&&current.csrDigest===u.csrDigest&&current.functionalityMap===u.unit.functionalityMap,'PRODUCTION_ONBOARDING_STALE');
      const attempts={};
      for(const k of slots(u)){
        const a=data(await tx.get(db.doc(root(s)+'/authorityAttempts/'+k)));
        if(a){need(same(a,s)&&a.slot===k&&['reserved','dispatched','completed'].includes(a.state));attempts[k]=a;}
      }
      return {u,current,attempts,held:Object.values(attempts).some(a=>a.state!=='completed')};
    });
  }
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
      const candidate=await buildComplianceInvoice({scope:s,type,profile:structuredClone(v.u),credential:structuredClone(credential)});
      need(candidate?.type===type&&candidate.mode===mode&&candidate.verifiedByOfficialSdk===true&&typeof candidate.uuid==='string'&&typeof candidate.invoiceHash==='string','PRODUCTION_COMPLIANCE_ARTIFACT_NOT_VERIFIED');
      const xml=bytes(candidate.invoice,512*1024),artifactDigest=sha(xml);
      await authority.reserveAttempt(slot,{scope:s,operation:'compliance-check',mode,uuid:candidate.uuid,invoiceHash:candidate.invoiceHash,artifactDigest,credentialRequestId:credential.requestId});
      const response=await client(s,slot).checkCompliance(credential,{uuid:candidate.uuid,invoiceHash:candidate.invoiceHash,invoice:candidate.invoice},mode);
      const outcome=await verifyComplianceResult({scope:s,type,candidate:{...candidate},response:{...response,evidenceBytes:Buffer.from(response.evidenceBytes)}});
      need((outcome==='verified-pass'&&response.status==='compliance-response')||outcome==='verified-fail','PRODUCTION_COMPLIANCE_UNRESOLVED');
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
    }
  });
}
