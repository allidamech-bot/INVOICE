import {createHash,randomUUID} from 'node:crypto';
import {simulationBase,readSimulationContext} from './simulation-scope.js';
import {STAGING_PROTECTION,stagingKeyLocator} from './softhsm-staging-signer.js';
import {requiredComplianceChecks} from './onboarding.js';
import {createZatcaSimulationClient} from './zatca-simulation.js';

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const HEX=/^[a-f0-9]{64}$/;
const keys=['accountUid','workspaceId','egsId','environment'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>a&&b&&keys.every(k=>a[k]===b[k]);
const data=s=>s.exists?s.data():null;
function need(ok,code='ONBOARDING_COMMAND_FORBIDDEN'){if(!ok)throw Error(code);}
function decode(v,max=32768){
  need(typeof v==='string'&&v.length<=Math.ceil(max/3)*4,'INVALID_ONBOARDING_BYTES');
  const b=Buffer.from(v,'base64');need(b.length>0&&b.length<=max&&b.toString('base64')===v,'INVALID_ONBOARDING_BYTES');return b;
}
function commandScope(identity,command,extra){
  need(identity?.role==='owner'&&typeof identity.uid==='string'&&ID.test(identity.uid));
  need(command&&typeof command==='object'&&!Array.isArray(command)&&Object.keys(command).length===2+extra.length&&['workspaceId','egsId'].every(k=>typeof command[k]==='string'&&ID.test(command[k]))&&extra.every(k=>Object.hasOwn(command,k)));
  return Object.freeze({accountUid:identity.uid,workspaceId:command.workspaceId,egsId:command.egsId,environment:'simulation'});
}
// No browser-supplied CSR, invoice bytes, certificate, credential ref, result,
// or authority URL. Every remote request is authorized against private data
// and is claimed durably before execution. Unknown results stay held.
function createEnrollment({db,vault,onboarding,verifyCsr,verifyCredential,buildComplianceInvoice,verifyComplianceResult,fetchImpl,clock=()=>new Date().toISOString(),makeId=randomUUID},softwareStaging){
  need(typeof db?.runTransaction==='function'&&typeof db?.doc==='function'&&typeof vault?.store==='function'&&typeof vault?.load==='function'&&['start','recordCheck','claimOperational','recordOperational'].every(k=>typeof onboarding?.[k]==='function')&&[verifyCsr,verifyCredential,buildComplianceInvoice,verifyComplianceResult,clock,makeId].every(f=>typeof f==='function'),'ONBOARDING_RUNTIME_UNAVAILABLE');
  function refs(s){const unit=simulationBase(s)+'/egs/'+s.egsId;return {unit,profile:db.doc(unit+'/enrollment/approved'),current:db.doc(unit+'/onboarding/current'),attempt:k=>db.doc(unit+'/enrollmentAttempts/'+k)};}
  function at(){const v=clock();need(typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v,'INVALID_ONBOARDING_TIME');return v;}
  function id(){const v=makeId();need(typeof v==='string'&&ID.test(v),'INVALID_ONBOARDING_ATTEMPT');return v;}
  function profileValue(p,s){
    need(same(p,s)&&p.state==='approved'&&p.issuer?.accountUid===s.accountUid&&p.issuer?.workspaceId===s.workspaceId&&p.issuer?.issuerCountry==='SA'&&p.issuer?.saRegime==='phase-2'&&/^3[0-9]{13}3$/.test(p.issuer?.vatNumber)&&p.keyBinding&&same(p.keyBinding,s)&&typeof p.keyBinding.publicKeyDigest==='string'&&HEX.test(p.keyBinding.publicKeyDigest)&&typeof p.keyBinding.keyVersion==='string'&&p.keyBinding.keyVersion&&(softwareStaging?p.keyBinding.protectionLevel===STAGING_PROTECTION&&p.keyBinding.keyVersion===stagingKeyLocator(s).keyVersion:['HSM','HSM_SINGLE_TENANT'].includes(p.keyBinding.protectionLevel)),'ONBOARDING_PROFILE_NOT_APPROVED');
    requiredComplianceChecks(p.functionalityMap);
    need(sha(decode(p.csr))===p.csrDigest,'ONBOARDING_CSR_MISMATCH');return p;
  }
  async function read(s,tx,r){
    const {unit}=await readSimulationContext(db,tx,s);
    need(unit.active===false,'ONBOARDING_UNIT_ACTIVE');
    const p=profileValue(data(await tx.get(r.profile)),s);
    const current=data(await tx.get(r.current));
    if(current)need(same(current.binding,s)&&current.csrDigest===p.csrDigest&&current.functionalityMap===p.functionalityMap,'ONBOARDING_PROFILE_CHANGED');
    return {p,current};
  }
  async function load(s){const r=refs(s);return db.runTransaction(tx=>read(s,tx,r));}
  async function hold(s,key,profile,currentVersion,attemptId){
    const r=refs(s),ref=r.attempt(key),digest=sha(Buffer.from(JSON.stringify(profile)));
    await db.runTransaction(async tx=>{
      const {p,current}=await read(s,tx,r),prior=await tx.get(ref);
      need(sha(Buffer.from(JSON.stringify(p)))===digest&&(current?.version??0)===currentVersion,'ONBOARDING_PROFILE_CHANGED');
      need(!prior.exists,'ONBOARDING_ATTEMPT_HELD');
      tx.create(ref,{...s,state:'held',attemptId,profileDigest:digest,version:currentVersion,at:at()});
    });
    return ref;
  }
  async function finish(s,ref,attemptId,profile,version){
    const r=refs(s);
    await db.runTransaction(async tx=>{
      const {p,current}=await read(s,tx,r),v=data(await tx.get(ref));
      need(same(v,s)&&v.state==='held'&&v.attemptId===attemptId&&v.profileDigest===sha(Buffer.from(JSON.stringify(p)))&&v.profileDigest===sha(Buffer.from(JSON.stringify(profile)))&&current?.version===version,'ONBOARDING_ATTEMPT_CHANGED');
      tx.update(ref,{state:'completed',completedAt:at(),resultVersion:version});
    });
  }
  function client(s){return createZatcaSimulationClient({environment:'simulation',authorizedScope:s,fetchImpl});}
  function projection(r){return {environment:'simulation',state:r.state,version:r.version,checks:r.checks.map(c=>({type:c.type,outcome:c.outcome})),requiredChecks:requiredComplianceChecks(r.functionalityMap)};}
  return Object.freeze({
    async begin(identity,command){
      const s=commandScope(identity,command,['otp']);need(typeof command.otp==='string'&&/^[0-9]{6}$/.test(command.otp),'INVALID_OTP');
      const {p,current}=await load(s);need(!current,'ONBOARDING_ALREADY_EXISTS');
      need(await verifyCsr({scope:s,issuer:structuredClone(p.issuer),keyBinding:structuredClone(p.keyBinding),csr:decode(p.csr),functionalityMap:p.functionalityMap})===true,'ONBOARDING_CSR_NOT_VERIFIED');
      const attempt=id(),ref=await hold(s,'compliance-csid',p,0,attempt);
      const credential=await client(s).requestCompliance({otp:command.otp,csr:p.csr});
      need(await verifyCredential({scope:s,kind:'compliance',credential:structuredClone(credential),profile:structuredClone(p)})===true,'ONBOARDING_CERTIFICATE_NOT_VERIFIED');
      // Deterministic immutable reference; no credentials or OTP in attempt rows.
      const credentialRef='compliance-'+attempt;
      await vault.store(s,credentialRef,credential);
      const result=await onboarding.start(s,{functionalityMap:p.functionalityMap,credentialRef,csrDigest:p.csrDigest});
      await finish(s,ref,attempt,p,result.version);return projection(result);
    },
    async check(identity,command){
      const s=commandScope(identity,command,['expectedVersion']);
      const {p,current}=await load(s);
      need(current?.state==='checking'&&Number.isSafeInteger(command.expectedVersion)&&command.expectedVersion===current.version,'STALE_ONBOARDING');
      need(await verifyCsr({scope:s,issuer:structuredClone(p.issuer),keyBinding:structuredClone(p.keyBinding),csr:decode(p.csr),functionalityMap:p.functionalityMap})===true,'ONBOARDING_CSR_NOT_VERIFIED');
      const type=requiredComplianceChecks(p.functionalityMap).find(t=>!current.checks.some(c=>c.type===t));need(type,'COMPLIANCE_ALREADY_COMPLETE');
      const credential=await vault.load(s,current.credentialRef,'compliance');
      need(same(credential,s)&&sha(credential.binarySecurityToken)===current.binding.certificateDigest,'COMPLIANCE_BINDING_MISMATCH');
      const candidate=await buildComplianceInvoice({scope:s,type,profile:structuredClone(p),credential:structuredClone(credential)});
      const mode=type.startsWith('standard-')?'clearance':'reporting';
      need(candidate?.type===type&&candidate.mode===mode&&candidate.verifiedByOfficialSdk===true&&typeof candidate.uuid==='string'&&typeof candidate.invoiceHash==='string','ONBOARDING_COMPLIANCE_ARTIFACT_NOT_VERIFIED');
      const xml=decode(candidate.invoice,512*1024),attempt=id(),ref=await hold(s,'check-'+type,p,current.version,attempt);
      const response=await client(s).checkCompliance(credential,{uuid:candidate.uuid,invoiceHash:candidate.invoiceHash,invoice:candidate.invoice},mode);
      // Only an independent verifier may classify a response. Unknown
      // responses hold the claimed request; no automatic duplicate checks.
      const outcome=await verifyComplianceResult({scope:s,type,candidate:{...candidate},response:{...response,evidenceBytes:Buffer.from(response.evidenceBytes)}});
      need((outcome==='verified-pass'&&response.status==='compliance-response')||outcome==='verified-fail','ONBOARDING_COMPLIANCE_UNRESOLVED');
      const result=await onboarding.recordCheck(s,current.version,{type,outcome,artifactBytes:xml,responseBytes:response.evidenceBytes});
      await finish(s,ref,attempt,p,result.version);return projection(result);
    },
    async operational(identity,command){
      const s=commandScope(identity,command,['expectedVersion']),{p,current}=await load(s);
      need(current?.state==='checks-complete'&&Number.isSafeInteger(command.expectedVersion)&&command.expectedVersion===current.version,'STALE_ONBOARDING');
      need(await verifyCsr({scope:s,issuer:structuredClone(p.issuer),keyBinding:structuredClone(p.keyBinding),csr:decode(p.csr),functionalityMap:p.functionalityMap})===true,'ONBOARDING_CSR_NOT_VERIFIED');
      const attempt=id(),ref=await hold(s,'operational-csid',p,current.version,attempt);
      const claimed=await onboarding.claimOperational(s,current.version,attempt);
      const compliance=await vault.load(s,claimed.record.credentialRef,'compliance');
      const credential=await client(s).requestProductionCsid(compliance,claimed.record);
      need(await verifyCredential({scope:s,kind:'production',credential:structuredClone(credential),profile:structuredClone(p)})===true,'ONBOARDING_CERTIFICATE_NOT_VERIFIED');
      const credentialRef='operational-'+attempt;
      await vault.store(s,credentialRef,credential);
      const result=await onboarding.recordOperational(s,claimed.version,attempt,credentialRef);
      await finish(s,ref,attempt,p,result.version);return projection(result);
    }
  });
}

export const createSimulationEnrollment=options=>createEnrollment(options,false);
export const createStagingSimulationEnrollment=options=>createEnrollment(options,true);
