import {createHash} from 'node:crypto';
import {fiscalCompanySourceDigest,parseProductionProfileCommand} from './production-profile.js';
import {normalizeSdk4Proof} from './sdk4-local-validator.js';
import {requiredComplianceChecks} from './onboarding.js';
import {verifyManagedProductionCsr} from './managed-csr.js';

const ID=/^[A-Za-z0-9_-]{1,128}$/,HEX=/^[a-f0-9]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VAT=/^3\d{13}3$/, HASH=/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
const KEY=/^projects\/([a-z][a-z0-9-]+)\/locations\/[a-z0-9-]+\/keyRings\/[A-Za-z0-9_-]+\/cryptoKeys\/[A-Za-z0-9_-]+\/cryptoKeyVersions\/[1-9][0-9]*$/;
const fields=['environment','accountUid','workspaceId','egsId'];
const id=v=>typeof v==='string'&&ID.test(v);
const hex=v=>typeof v==='string'&&HEX.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const data=s=>s.exists?s.data():null;
const same=(a,b)=>a&&b&&fields.every(k=>a[k]===b[k]);
const sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>sha(JSON.stringify(canonical(v)));
function need(ok,code='PRODUCTION_SCOPE_NOT_AUTHORIZED'){if(!ok)throw Error(code);}
function scope(v){need(v?.environment==='production'&&fields.slice(1).every(k=>id(v[k])));return Object.fromEntries(fields.map(k=>[k,v[k]]));}
function iso(v){return typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;}
function exact(v,keys){return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));}
function normalizeClaim(v){
  const s=scope(v?.scope),op=v.operation;
  let keys=['scope','operation'];
  if(op==='compliance-csid'){keys.push('csrDigest');need(hex(v.csrDigest));}
  else if(op==='operational-csid'){keys.push('credentialRequestId','onboardingVersion');need(positive(v.credentialRequestId)&&positive(v.onboardingVersion));}
  else if(op==='compliance-check'||op==='submit'){
    keys.push('mode','uuid','invoiceHash','artifactDigest','credentialRequestId');
    need(['clearance','reporting'].includes(v.mode)&&typeof v.uuid==='string'&&UUID.test(v.uuid)&&typeof v.invoiceHash==='string'&&HASH.test(v.invoiceHash)&&hex(v.artifactDigest)&&positive(v.credentialRequestId));
  }else need(false);
  need(exact(v,keys)&&exact(v.scope,fields));
  return {...v,scope:s};
}
// Private production composition. No browser-facing provisioning or activation.
// Real eligibility and HSM verification are mandatory independently supplied services.
export function createProductionScopeAuthority({db,loadWorkspace,verifyRegistration,verifyOperation,verifyResult,kmsProjectId,sdkManifestSha256,clock=()=>new Date().toISOString()}){
  need(typeof db?.doc==='function'&&typeof db?.runTransaction==='function'&&[loadWorkspace,verifyRegistration,verifyOperation,verifyResult,clock].every(f=>typeof f==='function')&&typeof kmsProjectId==='string'&&/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(kmsProjectId)&&!kmsProjectId.endsWith('-fiscal-qa'),'PRODUCTION_SCOPE_UNAVAILABLE');
  const base=s=>'fiscalProductionV1/'+s.accountUid+'/workspaces/'+s.workspaceId;
  const unitRef=s=>db.doc(base(s)+'/egs/'+s.egsId);
  const requestRef=(s,branchId)=>db.doc(base(s)+'/provisioningRequests/'+branchId);
  const profileLockRef=s=>db.doc(base(s)+'/profiles/registration-lock');
  function checkProfileLock(lock,s,p){need(lock?.environment==='production'&&lock.accountUid===s.accountUid&&lock.workspaceId===s.workspaceId&&lock.profileVersion===p.version&&lock.sourceDigest===p.sourceDigest,'PRODUCTION_PROFILE_CHANGED');}
  const keyRef=b=>db.doc('fiscalProductionKeyRegistryV1/key-'+sha(b.keyVersion.replace(/\/cryptoKeyVersions\/[1-9][0-9]*$/,'')));
  const pubRef=b=>db.doc('fiscalProductionKeyRegistryV1/pub-'+b.publicKeyDigest);
  const attemptRef=(s,slot)=>db.doc(base(s)+'/egs/'+s.egsId+'/authorityAttempts/'+slot);
  // UUID is unique across this entire company, not solely the selected unit.
  const submitRef=(s,uuid)=>db.doc(base(s)+'/submissionClaims/'+uuid);
  function at(){const t=clock();need(iso(t),'INVALID_FISCAL_CLOCK');return t;}
  async function currentProfile(tx,s){
    const workspace=await loadWorkspace(tx,{accountUid:s.accountUid,workspaceId:s.workspaceId});
    const p=data(await tx.get(db.doc(base(s)+'/profiles/current')));
    need(p?.environment==='production'&&p.accountUid===s.accountUid&&p.workspaceId===s.workspaceId&&p.state==='pending-verification'&&positive(p.version)&&p.sourceDigest===fiscalCompanySourceDigest(workspace.company),'PRODUCTION_PROFILE_CHANGED');
    parseProductionProfileCommand({operation:'save',workspaceId:s.workspaceId,expectedVersion:p.version,details:p.details});
    return {workspace,p};
  }
  function binding(b,s){
    need(same(b,s)&&typeof b.keyVersion==='string'&&KEY.exec(b.keyVersion)?.[1]===kmsProjectId&&hex(b.publicKeyDigest)&&['HSM','HSM_SINGLE_TENANT'].includes(b.protectionLevel));
    return {...s,keyVersion:b.keyVersion,publicKeyDigest:b.publicKeyDigest,protectionLevel:b.protectionLevel};
  }
  function registration(input,s,workspace,p){
    // The approved legal identity must be derived from the exact current
    // company source, not a second user-entered business identity.
    need(id(input.branchId)&&workspace.branches.some(b=>b.id===input.branchId&&b.workspaceId===s.workspaceId&&b.active===true));
    const issuer=input.issuer,unit=input.unit,b=binding(input.binding,s);
    need(issuer?.accountUid===s.accountUid&&issuer.workspaceId===s.workspaceId&&issuer.issuerCountry==='SA'&&issuer.saRegime==='phase-2'&&issuer.vatNumber===workspace.company.vatNumber.trim()&&VAT.test(issuer.vatNumber)&&issuer.legalName===workspace.company.nameAr.trim()&&positive(issuer.profileVersion)&&issuer.profileVersion===p.version&&typeof issuer.effectiveFrom==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(issuer.effectiveFrom)&&Number.isFinite(Date.parse(issuer.effectiveFrom))&&new Date(issuer.effectiveFrom).toISOString().slice(0,10)===issuer.effectiveFrom&&issuer.effectiveFrom<=at().slice(0,10));
    need(unit?.egsId===s.egsId&&typeof unit.serialNumber==='string'&&/^1-[^|\r\n]+\|2-[^|\r\n]+\|3-[^|\r\n]+$/.test(unit.serialNumber));
    const u={egsId:s.egsId};for(const k of ['serialNumber','organizationUnit','commonName','registeredAddress','functionalityMap','businessCategory']){need(typeof unit[k]==='string'&&unit[k].trim()===unit[k]&&unit[k].length>0&&unit[k].length<=250&&!/[\x00-\x1f\x7f]/.test(unit[k]));u[k]=unit[k];}
    requiredComplianceChecks(u.functionalityMap);
    const i=Object.fromEntries(['accountUid','workspaceId','issuerCountry','saRegime','vatNumber','legalName','profileVersion','effectiveFrom'].map(k=>[k,issuer[k]]));
    need(hex(input.eligibilityEvidenceDigest),'PRODUCTION_ELIGIBILITY_UNVERIFIED');
    return {...s,branchId:input.branchId,issuer:i,unit:u,binding:b,profileVersion:p.version,profileDigest:digest(p),eligibilityEvidenceDigest:input.eligibilityEvidenceDigest};
  }
  async function read(tx,s){
    // An independently authorized emergency hold is immutable and denies
    // every future enrollment, credential load, signing and ZATCA dispatch.
    // Never bypass it by relying on a cached active EGS document.
    const hold=data(await tx.get(db.doc(base(s)+'/egs/'+s.egsId+'/security/hold')));
    need(!hold,'PRODUCTION_SECURITY_HOLD');
    const {workspace,p}=await currentProfile(tx,s),u=data(await tx.get(unitRef(s)));
    checkProfileLock(data(await tx.get(profileLockRef(s))),s,p);
    need(same(u,s)&&['enrolling','active'].includes(u.state)&&u.profileVersion===p.version&&u.profileDigest===digest(p));
    const b=binding(u.binding,s),checked=registration(u,s,workspace,p);
    need(u.registrationDigest===digest(checked)&&digest(checked.binding)===digest(u.binding)&&digest(checked.issuer)===digest(u.issuer)&&digest(checked.unit)===digest(u.unit));
    const key=data(await tx.get(keyRef(b))),pub=data(await tx.get(pubRef(b)));
    need(same(key,s)&&same(pub,s)&&key.bindingDigest===digest(b)&&pub.bindingDigest===digest(b),'PRODUCTION_KEY_NOT_BOUND');
    return u;
  }
  async function checkEnrollmentStage(tx,s,u,slot,c,{dispatch=false}={}){
    if(c.operation==='submit')return;
    const root=base(s)+'/egs/'+s.egsId;
    const current=data(await tx.get(db.doc(root+'/onboarding/current')));
    const required=requiredComplianceChecks(u.unit.functionalityMap);
    if(c.operation==='compliance-csid'){need(!current,'PRODUCTION_ONBOARDING_STALE');return;}
    need(same(current?.binding,s)&&current.csrDigest===u.csrDigest&&current.functionalityMap===u.unit.functionalityMap&&positive(current.version)&&Array.isArray(current.checks)&&current.binding.requestId===c.credentialRequestId,'PRODUCTION_ONBOARDING_STALE');
    const completedSlots=['compliance-csid',...current.checks.filter(x=>x.outcome==='verified-pass').map(x=>'check-'+x.type)];
    for(const k of completedSlots){const prior=data(await tx.get(attemptRef(s,k)));need(same(prior,s)&&prior.state==='completed'&&prior.evidence?.outcome==='verified-pass','PRODUCTION_ATTEMPT_HELD');}
    if(c.operation==='compliance-check'){
      const type=required.find(t=>!current.checks.some(x=>x.type===t));
      need(current.state==='checking'&&slot==='check-'+type,'PRODUCTION_ONBOARDING_STALE');
      const a=data(await tx.get(db.doc(root+'/complianceCandidates/'+type)));
      need(same(a,s)&&a.type===type&&a.onboardingVersion===current.version&&['mode','uuid','invoiceHash','artifactDigest','credentialRequestId'].every(k=>a[k]===c[k])&&typeof a.invoice==='string'&&a.invoice.length<=Math.ceil(512*1024/3)*4,'PRODUCTION_COMPLIANCE_ARTIFACT_NOT_VERIFIED');
      const bytes=Buffer.from(a.invoice,'base64');need(bytes.length>0&&bytes.toString('base64')===a.invoice&&sha(bytes)===c.artifactDigest,'PRODUCTION_COMPLIANCE_ARTIFACT_NOT_VERIFIED');
      const proof=normalizeSdk4Proof(a.sdkProof,c);need(hex(sdkManifestSha256)&&proof.kind===type&&proof.installationManifestSha256===sdkManifestSha256,'PRODUCTION_COMPLIANCE_ARTIFACT_NOT_VERIFIED');
    }
    else need(current.checks.length===required.length&&required.every(t=>current.checks.filter(x=>x.type===t&&x.outcome==='verified-pass').length===1)&&(dispatch?(current.state==='operational-request-held'&&current.version===c.onboardingVersion+1):(current.state==='checks-complete'&&current.version===c.onboardingVersion)),'PRODUCTION_ONBOARDING_STALE');
  }
  function slotFor(u,input,claim){
    if(claim.operation==='compliance-csid'){need(input==='compliance-csid'&&u.state==='enrolling'&&u.csrDigest===claim.csrDigest);}
    else if(claim.operation==='compliance-check'){
      need(u.state==='enrolling'&&requiredComplianceChecks(u.unit.functionalityMap).some(t=>input==='check-'+t&&claim.mode===(t.startsWith('standard-')?'clearance':'reporting')));
    }else if(claim.operation==='operational-csid'){need(input==='operational-csid'&&u.state==='enrolling');}
    else need(u.state==='active'&&input==='submit-'+claim.uuid);
    return input;
  }
  return Object.freeze({
    async registerUnit(identity,input){
      const s=scope(input?.scope);need(identity?.role==='owner'&&identity.uid===s.accountUid);
      const initial=await db.runTransaction(async tx=>{const {workspace,p}=await currentProfile(tx,s);return registration(input,s,workspace,p);});
      need(await verifyRegistration(structuredClone(initial))===true,'PRODUCTION_REGISTRATION_NOT_VERIFIED');
      return db.runTransaction(async tx=>{
        const {workspace,p}=await currentProfile(tx,s),next=registration(input,s,workspace,p);
        need(digest(next)===digest(initial),'PRODUCTION_PROFILE_CHANGED');
        const existing=data(await tx.get(unitRef(s))),key=data(await tx.get(keyRef(next.binding))),pub=data(await tx.get(pubRef(next.binding))),lock=data(await tx.get(profileLockRef(s)));
        if(lock)checkProfileLock(lock,s,p);
        const request=data(await tx.get(requestRef(s,next.branchId)));
        need(request?.environment==='production'&&request.accountUid===s.accountUid&&request.workspaceId===s.workspaceId&&request.branchId===next.branchId&&request.profileVersion===p.version&&request.sourceDigest===p.sourceDigest&&request.functionalityMap===next.unit.functionalityMap&&request.businessCategory===next.unit.businessCategory&&request.state===(existing?'registered':'pending')&&(existing?request.egsId===s.egsId:request.egsId===undefined),'PRODUCTION_REGISTRATION_REQUEST_REQUIRED');
        const lockProfile=()=>{if(!lock)tx.create(profileLockRef(s),{environment:'production',accountUid:s.accountUid,workspaceId:s.workspaceId,profileVersion:p.version,sourceDigest:p.sourceDigest,createdAt:at()});};
        if(existing){need(same(existing,s)&&existing.registrationDigest===digest(next)&&same(key,s)&&same(pub,s)&&key.bindingDigest===digest(next.binding)&&pub.bindingDigest===digest(next.binding),'PRODUCTION_UNIT_CONFLICT');lockProfile();return {state:existing.state,egsId:s.egsId};}
        need(!key&&!pub,'PRODUCTION_KEY_ALREADY_BOUND');
        const entry={...s,bindingDigest:digest(next.binding),createdAt:at()};
        lockProfile();
        tx.create(keyRef(next.binding),entry);tx.create(pubRef(next.binding),entry);
        tx.create(unitRef(s),{...next,registrationDigest:digest(next),state:'enrolling',createdAt:at()});
        tx.update(requestRef(s,next.branchId),{state:'registered',egsId:s.egsId,registeredAt:at()});
        return {state:'enrolling',egsId:s.egsId};
      });
    },
    // Internal transaction reader for the production enrollment store and coordinator.
    async readUnit(tx,s){return read(tx,scope(s));},
    // Only a private signer calling this callback can use the registered key.
    async authorizeBinding(b){try{const s=scope(b);return await db.runTransaction(async tx=>digest(binding(b,s))===digest((await read(tx,s)).binding));}catch{return false;}},
    async authorizeCredential(tx,c,operation){
      try{const s=scope(c);need(id(c.ref)&&['compliance','production'].includes(c.kind)&&['store','load'].includes(operation));await read(tx,s);return true;}catch{return false;}
    },
    async recordCsr(s,result){
      s=scope(s);need(typeof result?.csr==='string'&&result.csr.length<=45000&&hex(result.csrDigest)&&typeof result.publicKey==='string'&&result.publicKey.length<=2048);
      const bytes=Buffer.from(result.csr,'base64');need(bytes.length>0&&bytes.toString('base64')===result.csr&&sha(bytes)===result.csrDigest);
      const initial=await db.runTransaction(tx=>read(tx,s));
      need(initial.state==='enrolling'&&verifyManagedProductionCsr({scope:s,issuer:initial.issuer,unit:initial.unit,binding:initial.binding,csr:bytes,publicKey:result.publicKey})===true,'PRODUCTION_CSR_NOT_VERIFIED');
      return db.runTransaction(async tx=>{const u=await read(tx,s);need(u.state==='enrolling'&&u.registrationDigest===initial.registrationDigest);if(u.csrDigest){need(u.csrDigest===result.csrDigest,'PRODUCTION_CSR_CONFLICT');return {csrDigest:u.csrDigest};}tx.update(unitRef(s),{csrDigest:result.csrDigest,csr:result.csr,publicKey:result.publicKey});return {csrDigest:result.csrDigest};});
    },
    async reserveAttempt(input,claim){
      const c=normalizeClaim(claim),s=c.scope,slot=input;
      need(id(slot));
      const initial=await db.runTransaction(async tx=>{const u=await read(tx,s);slotFor(u,slot,c);await checkEnrollmentStage(tx,s,u,slot,c);return u;});
      // The lifecycle supplies a verified, revision-bound artifact / CSID
      // check. Structural claim validation alone never permits authority I/O.
      need(await verifyOperation({unit:structuredClone(initial),slot,claim:structuredClone(c)})===true,'PRODUCTION_OPERATION_NOT_VERIFIED');
      return db.runTransaction(async tx=>{
        const u=await read(tx,s);slotFor(u,slot,c);await checkEnrollmentStage(tx,s,u,slot,c);need(digest(u)===digest(initial),'PRODUCTION_OPERATION_STALE');
        const ref=attemptRef(s,slot),prior=data(await tx.get(ref)),global=c.operation==='submit'?data(await tx.get(submitRef(s,c.uuid))):null;
        need(!prior&&!global,'PRODUCTION_ATTEMPT_HELD');
        const row={...s,slot,claimDigest:digest(c),claim:c,state:'reserved',unitDigest:digest(u),createdAt:at()};
        if(c.operation==='submit')tx.create(submitRef(s,c.uuid),{...s,slot,claimDigest:row.claimDigest});
        tx.create(ref,row);return {state:'reserved',slot,claimDigest:row.claimDigest};
      });
    },
    // Bind the operation authorizer to one slot before constructing the
    // production transport. Consume exactly once; a timeout never re-arms it.
    operationAuthorizer(s,slot){
      s=scope(s);need(id(slot));
      return async raw=>{
        const c=normalizeClaim(raw);need(same(c.scope,s));
        return db.runTransaction(async tx=>{
          const u=await read(tx,s);slotFor(u,slot,c);
          const ref=attemptRef(s,slot),a=data(await tx.get(ref));
          need(same(a,s)&&a.state==='reserved'&&a.slot===slot&&a.claimDigest===digest(c)&&a.unitDigest===digest(u),'PRODUCTION_ATTEMPT_HELD');
          await checkEnrollmentStage(tx,s,u,slot,c,{dispatch:true});
          tx.update(ref,{state:'dispatched',dispatchedAt:at()});return true;
        });
      };
    },
    async recordResult(s,slot,evidence){
      s=scope(s);need(id(slot)&&hex(evidence?.digest)&&['verified-pass','verified-fail'].includes(evidence?.outcome));
      const initial=await db.runTransaction(async tx=>{await read(tx,s);const a=data(await tx.get(attemptRef(s,slot)));need(same(a,s)&&['dispatched','completed'].includes(a.state));return a;});
      // No raw authority secrets / response bodies in this journal.
      const proof={digest:evidence.digest,outcome:evidence.outcome};
      if(initial.state==='completed'){need(digest(initial.evidence)===digest(proof),'PRODUCTION_RESULT_NOT_VERIFIED');return {state:'completed',outcome:proof.outcome};}
      need(await verifyResult({attempt:structuredClone(initial),evidence:proof})===true,'PRODUCTION_RESULT_NOT_VERIFIED');
      return db.runTransaction(async tx=>{await read(tx,s);const ref=attemptRef(s,slot),a=data(await tx.get(ref));need(same(a,s)&&digest(a)===digest(initial),'PRODUCTION_ATTEMPT_HELD');tx.update(ref,{state:'completed',evidence:proof,completedAt:at()});return {state:'completed',outcome:proof.outcome};});
    }
  });
}
