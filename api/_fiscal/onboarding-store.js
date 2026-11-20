import {createHash} from 'node:crypto';
import {startOnboarding,startProductionOnboarding,recordComplianceCheck,assertReadyForProductionCsid,assertProductionOnboardingReady} from './onboarding.js';

// Internal Admin service. The caller must authorize the actor and verify the
// compliance evidence and certificate policy before these transitions.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
function id(v){if(typeof v!=='string'||!ID.test(v))throw Error('INVALID_ONBOARDING_SCOPE');return v;}
function paths(db,s,environment){
  if(s?.environment!==environment)throw Error(environment==='simulation'?'SIMULATION_ONLY':'PRODUCTION_ONLY');
  const base=(environment==='simulation'?'fiscalPrivateV1/':'fiscalProductionV1/')+id(s.accountUid)+'/workspaces/'+id(s.workspaceId);
  const unit=base+'/egs/'+id(s.egsId);
  return {workspace:db.doc(base),unit:db.doc(unit),record:db.doc(unit+'/onboarding/current'),credential:ref=>db.doc(unit+'/'+(environment==='simulation'?'simulationCredentials':'productionCredentials')+'/'+id(ref))};
}
function same(v,s,unit=false){return v&&v.accountUid===s.accountUid&&v.workspaceId===s.workspaceId&&v.environment===s.environment&&(!unit||v.egsId===s.egsId);}
function digest(v){return createHash('sha256').update(v).digest('hex');}
function checkEnvelope(v,s,ref,kind){if(!same(v,s,true)||v.ref!==ref||v.kind!==kind||v.version!==1)throw Error('ONBOARDING_CREDENTIAL_MISSING');}
function data(snap){return snap.exists?snap.data():null;}
function version(record,expected){if(!record||!Number.isSafeInteger(expected)||expected<1||record.version!==expected||expected>=Number.MAX_SAFE_INTEGER)throw Error('STALE_ONBOARDING');}
function binding(record,s){if(!same(record?.binding,s,true))throw Error('ONBOARDING_SCOPE_MISMATCH');}
function evidence(bytes){if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>512*1024)throw Error('INVALID_ONBOARDING_EVIDENCE');return {sha256:digest(bytes),bytes:bytes.toString('base64')};}

function createOnboardingStore({db,vault,readUnit},environment){
  if(environment==='production'&&typeof readUnit!=='function')throw Error('ONBOARDING_STORE_UNAVAILABLE');
  if(!db||typeof db.doc!=='function'||typeof db.runTransaction!=='function'||typeof vault?.load!=='function')throw Error('ONBOARDING_STORE_UNAVAILABLE');
  async function context(tx,p,s){
    if(environment==='production'){const unit=await readUnit(tx,s);if(!same(unit,s,true)||unit.state!=='enrolling')throw Error('ONBOARDING_SCOPE_FORBIDDEN');return;}
    const w=data(await tx.get(p.workspace)), u=data(await tx.get(p.unit));
    if(!same(w,s)||w.syntheticOnly!==true||!same(u,s,true)||u.active!==false)throw Error('ONBOARDING_SCOPE_FORBIDDEN');
  }
  function event(p,v){return db.doc(p.record.path+'/events/'+String(v));}
  return Object.freeze({
    async start(s,{functionalityMap,credentialRef,csrDigest}){
      const p=paths(db,s,environment), credential=await vault.load(s,credentialRef,'compliance');
      const initial=(environment==='simulation'?startOnboarding:startProductionOnboarding)({functionalityMap,credentialRef,csrDigest,credential});binding(initial,s);
      return db.runTransaction(async tx=>{
        await context(tx,p,s);
        const current=data(await tx.get(p.record));
        checkEnvelope(data(await tx.get(p.credential(credentialRef))),s,credentialRef,'compliance');
        if(current)throw Error('ONBOARDING_ALREADY_EXISTS');
        tx.create(p.record,initial);tx.create(event(p,1),{version:1,state:initial.state});return initial;
      });
    },
    async recordCheck(s,expected,{type,outcome,artifactBytes,responseBytes,httpStatus}){
      const p=paths(db,s,environment), artifact=evidence(artifactBytes), response=evidence(responseBytes);
      if(environment==='production'&&![200,202].includes(httpStatus))throw Error('INVALID_ONBOARDING_EVIDENCE');
      return db.runTransaction(async tx=>{
        await context(tx,p,s);
        const current=data(await tx.get(p.record));version(current,expected);binding(current,s);
        const next=recordComplianceCheck(current,expected,{type,outcome,artifactDigest:artifact.sha256,responseDigest:response.sha256});
        const e=event(p,next.version);
        tx.create(db.doc(e.path+'/artifacts/invoice'),artifact);tx.create(db.doc(e.path+'/artifacts/response'),response);
        tx.create(e,{version:next.version,state:next.state,type,outcome,artifactDigest:artifact.sha256,responseDigest:response.sha256,...(environment==='production'?{httpStatus}:{})});
        tx.update(p.record,next);return next;
      });
    },
    // Claim BEFORE remote CSID request. A crash or unknown response remains
    // held; neither another worker nor a restart can replay this request.
    async claimOperational(s,expected,attemptId){
      const p=paths(db,s,environment);id(attemptId);
      const current=await db.runTransaction(async tx=>{await context(tx,p,s);return data(await tx.get(p.record));});
      version(current,expected);binding(current,s);
      const credential=await vault.load(s,current.credentialRef,'compliance');
      return db.runTransaction(async tx=>{
        await context(tx,p,s);
        const stored=data(await tx.get(p.record));version(stored,expected);binding(stored,s);
        if(stored.credentialRef!==current.credentialRef)throw Error('ONBOARDING_BINDING_CHANGED');
        checkEnvelope(data(await tx.get(p.credential(stored.credentialRef))),s,stored.credentialRef,'compliance');
        (environment==='simulation'?assertReadyForProductionCsid:assertProductionOnboardingReady)(stored,credential);
        const next={...stored,state:'operational-request-held',attemptId,version:expected+1};
        tx.create(event(p,next.version),{version:next.version,state:next.state,attemptId});tx.update(p.record,next);
        // Only the internal caller receives the pre-claim gate record. No secrets returned.
        return {record:stored,attemptId,version:next.version};
      });
    },
    // Trusted caller has verified the returned certificate and persisted it in
    // the vault. This records evidence, not an active EGS or approval to issue.
    async recordOperational(s,expected,attemptId,credentialRef){
      const p=paths(db,s,environment);id(attemptId);id(credentialRef);
      const credential=await vault.load(s,credentialRef,'production');
      if(!same(credential,s,true)||credential.kind!=='production'||typeof credential.binarySecurityToken!=='string'||!credential.binarySecurityToken||!Number.isSafeInteger(credential.requestId)||credential.requestId<1)throw Error('INVALID_OPERATIONAL_CREDENTIAL');
      return db.runTransaction(async tx=>{
        await context(tx,p,s);
        const current=data(await tx.get(p.record));version(current,expected);binding(current,s);
        if(current.state!=='operational-request-held'||current.attemptId!==attemptId||current.credentialRef===credentialRef)throw Error('ONBOARDING_ATTEMPT_MISMATCH');
        checkEnvelope(data(await tx.get(p.credential(credentialRef))),s,credentialRef,'production');
        const next={...current,state:'operational-recorded',version:expected+1,operationalCredentialRef:credentialRef,operationalCertificateDigest:digest(credential.binarySecurityToken),operationalRequestId:credential.requestId};
        tx.create(event(p,next.version),{version:next.version,state:next.state,attemptId,credentialRef,certificateDigest:next.operationalCertificateDigest});tx.update(p.record,next);return next;
      });
    }
  });
}

export const createSimulationOnboardingStore=options=>createOnboardingStore(options,'simulation');
export const createProductionOnboardingStore=options=>createOnboardingStore(options,'production');
