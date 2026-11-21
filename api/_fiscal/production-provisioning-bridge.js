import {createHash} from 'node:crypto';
import {fiscalCompanySourceDigest} from './production-profile.js';

// PRIVATE trusted-operator entrypoint. Never import this from an HTTP handler
// or accept operator approval, KMS key paths, or identity evidence from a browser.
// The operator/IAM, taxpayer authorization and key provider are deliberately
// independent externally provisioned capabilities. No mock defaults.
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const HEX=/^[a-f0-9]{64}$/;
const KEY=/^projects\/[a-z][a-z0-9-]+\/locations\/[a-z0-9-]+\/keyRings\/[A-Za-z0-9_-]+\/cryptoKeys\/[A-Za-z0-9_-]+\/cryptoKeyVersions\/[1-9][0-9]*$/;
const data=s=>s.exists?s.data():null;
const need=(ok,code='PRODUCTION_PROVISIONING_UNAVAILABLE')=>{if(!ok)throw Error(code);};
const id=v=>typeof v==='string'&&ID.test(v);
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const same=(a,b,fields)=>a&&b&&fields.every(k=>a[k]===b[k]);
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');

export function createProductionProvisioningBridge({
  db,loadWorkspace,registerVerifiedUnit,readRegisteredUnit,authorizeOperator,
  verifyTaxpayerEligibility,resolveApprovedHsmKey,clock=()=>new Date().toISOString(),
}){
  need(typeof db?.doc==='function'&&typeof db?.runTransaction==='function'&&
    [loadWorkspace,registerVerifiedUnit,readRegisteredUnit,authorizeOperator,
      verifyTaxpayerEligibility,resolveApprovedHsmKey,clock].every(fn=>typeof fn==='function'));
  async function source({accountUid,workspaceId,branchId}){
    const root='fiscalProductionV1/'+accountUid+'/workspaces/'+workspaceId;
    return db.runTransaction(async tx=>{
      const workspace=await loadWorkspace(tx,{accountUid,workspaceId});
      need(Array.isArray(workspace?.branches)&&workspace.branches.some(b=>
        b?.id===branchId&&b.workspaceId===workspaceId&&b.active===true),
        'PRODUCTION_PROVISIONING_SOURCE_CHANGED');
      const profile=data(await tx.get(db.doc(root+'/profiles/current')));
      const request=data(await tx.get(db.doc(root+'/provisioningRequests/'+branchId)));
      const sourceDigest=fiscalCompanySourceDigest(workspace.company);
      need(profile?.environment==='production'&&profile.accountUid===accountUid&&
        profile.workspaceId===workspaceId&&profile.state==='pending-verification'&&
        Number.isSafeInteger(profile.version)&&profile.version>0&&
        profile.sourceDigest===sourceDigest,'PRODUCTION_PROVISIONING_SOURCE_CHANGED');
      need(request?.environment==='production'&&request.accountUid===accountUid&&
        request.workspaceId===workspaceId&&request.branchId===branchId&&
        request.profileVersion===profile.version&&request.sourceDigest===sourceDigest&&
        ['pending','registered'].includes(request.state)&&
        ['1000','0100','1100'].includes(request.functionalityMap)&&
        typeof request.businessCategory==='string'&&request.businessCategory.length>0,
        'PRODUCTION_PROVISIONING_REQUEST_REQUIRED');
      const c=workspace.company;
      need(/^3\d{13}3$/.test(c.vatNumber?.trim()??'')&&
        /^\d{10}$/.test(c.commercialRegistration?.trim()??''),
        'PRODUCTION_PROVISIONING_SOURCE_CHANGED');
      const snapshot={accountUid,workspaceId,branchId,profileVersion:profile.version,
        sourceDigest,vatNumber:c.vatNumber.trim(),
        commercialRegistration:c.commercialRegistration.trim(),
        functionalityMap:request.functionalityMap,businessCategory:request.businessCategory};
      if(request.state==='registered'){
        const egsId='egs-'+digest([accountUid,workspaceId,branchId]).slice(0,40);
        need(request.egsId===egsId,'PRODUCTION_PROVISIONING_SOURCE_CHANGED');
        // The request projection is not authority evidence. A corrupted
        // registered marker or a held EGS must never short-circuit retries
        // into a false successful provisioning result.
        const path=root+'/egs/'+egsId;
        const hold=data(await tx.get(db.doc(path+'/security/hold')));
        need(!hold,'PRODUCTION_SECURITY_HOLD');
        // A request marker and a few EGS fields are not cryptographic proof.
        // Reuse the SAME authority reader used by signing and issuance. It
        // verifies profile lock/digest, immutable registration digest, HSM
        // binding, public-key uniqueness registry and the security hold.
        let unit;
        try{unit=await readRegisteredUnit(tx,{
          environment:'production',accountUid,workspaceId,egsId
        });}catch{need(false,'PRODUCTION_PROVISIONING_SOURCE_CHANGED');}
        need(unit?.environment==='production'&&unit.accountUid===accountUid&&
          unit.workspaceId===workspaceId&&unit.egsId===egsId&&
          unit.branchId===branchId&&unit.unit?.egsId===egsId&&
          ['enrolling','active'].includes(unit.state)&&
          unit.profileVersion===profile.version&&
          unit.issuer?.accountUid===accountUid&&unit.issuer.workspaceId===workspaceId&&
          unit.issuer.vatNumber===snapshot.vatNumber&&
          unit.issuer.legalName===workspace.company.nameAr.trim()&&
          HEX.test(unit.registrationDigest??'')&&
          HEX.test(unit.eligibilityEvidenceDigest??''),
          'PRODUCTION_PROVISIONING_SOURCE_CHANGED');
        return {...snapshot,state:'registered',egsId};
      }
      need(request.egsId===undefined,'PRODUCTION_PROVISIONING_SOURCE_CHANGED');
      return {...snapshot,state:'pending'};
    });
  }
  return async function provision(scope,operatorContext){
    need(scope&&Object.keys(scope).sort().join(',')==='accountUid,branchId,workspaceId'&&
      [scope.accountUid,scope.workspaceId,scope.branchId].every(id),
      'PRODUCTION_PROVISIONING_FORBIDDEN');
    // An operator service must attest a separately authenticated worker identity.
    // Client-supplied Firebase identity alone is NEVER operator authorization.
    need(await authorizeOperator(Object.freeze({...scope}),operatorContext)===true,
      'PRODUCTION_PROVISIONING_FORBIDDEN');
    const initial=await source(scope);
    if(initial.state==='registered')
      return {state:'already-provisioned',egsId:initial.egsId};
    const verificationScope=Object.freeze({...initial});
    const approval=await verifyTaxpayerEligibility(verificationScope);
    const now=clock(),timestamp=Date.parse(now);
    need(iso(now),'PRODUCTION_PROVISIONING_UNAVAILABLE');
    need(approval?.eligible===true&&
      same(approval,initial,['accountUid','workspaceId','branchId','profileVersion',
        'sourceDigest','vatNumber','commercialRegistration'])&&
      HEX.test(approval.eligibilityEvidenceDigest??'')&&iso(approval.verifiedAt)&&
      timestamp-Date.parse(approval.verifiedAt)>=0&&
      timestamp-Date.parse(approval.verifiedAt)<=60*60*1000,
      'PRODUCTION_ELIGIBILITY_UNVERIFIED');
    // The key provider MUST use this stable idempotency key. A retry after
    // an interrupted KMS allocation may not silently allocate another EGS key.
    const idempotencyKey=digest([initial.accountUid,initial.workspaceId,
      initial.branchId,initial.profileVersion,initial.sourceDigest]);
    const binding=await resolveApprovedHsmKey(Object.freeze({
      ...initial,eligibilityEvidenceDigest:approval.eligibilityEvidenceDigest,idempotencyKey
    }));
    need(binding&&binding.idempotencyKey===idempotencyKey&&
      same(binding,initial,['accountUid','workspaceId','branchId','profileVersion',
        'sourceDigest'])&&KEY.test(binding.keyVersion??'')&&
      typeof binding.organizationUnit==='string'&&
      binding.organizationUnit.trim()===binding.organizationUnit&&
      binding.organizationUnit.length>0&&Buffer.byteLength(binding.organizationUnit)<=250&&
      !/[\x00-\x1f\x7f]/.test(binding.organizationUnit)&&
      typeof binding.effectiveFrom==='string'&&
      /^\d{4}-\d{2}-\d{2}$/.test(binding.effectiveFrom)&&
      !Number.isNaN(Date.parse(binding.effectiveFrom)),
      'PRODUCTION_HSM_NOT_VERIFIED');
    // Close the time-of-check/time-of-use gap. The actual registration
    // coordinator re-reads this source and checks the non-exportable key
    // through Cloud KMS and the authority's independent authorization.
    const latest=await source(scope);
    need(latest.state==='pending'&&
      same(latest,initial,['accountUid','workspaceId','branchId','profileVersion',
        'sourceDigest','vatNumber','commercialRegistration','functionalityMap',
        'businessCategory']),'PRODUCTION_PROVISIONING_SOURCE_CHANGED');
    const result=await registerVerifiedUnit({uid:scope.accountUid,role:'owner'},{
      workspaceId:scope.workspaceId,branchId:scope.branchId,
      keyVersion:binding.keyVersion,
      eligibilityEvidenceDigest:approval.eligibilityEvidenceDigest,
      effectiveFrom:binding.effectiveFrom,organizationUnit:binding.organizationUnit,
      expectedProfileVersion:initial.profileVersion,
    });
    need(result?.state==='enrolling'&&id(result.egsId),
      'PRODUCTION_PROVISIONING_UNAVAILABLE');
    // This acknowledges ONLY an internally provisioned EGS. It is NOT a
    // Compliance/Production CSID or ZATCA-approved taxpayer connection.
    return {state:'provisioned-for-onboarding',egsId:result.egsId};
  };
}
