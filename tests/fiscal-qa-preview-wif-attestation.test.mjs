import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateQaPreviewWifEvidence,FISCAL_QA_WIF} from
  '../scripts/fiscal/audit-google-qa-preview-wif.mjs';

function fixture(){
  const q=FISCAL_QA_WIF;
  const subject='principal://iam.googleapis.com/projects/'+q.identityNumber+
    '/locations/global/workloadIdentityPools/'+q.pool+'/subject/'+q.subject;
  const member='serviceAccount:'+q.email;
  return {
    identityProject:{projectId:q.identity,projectNumber:q.identityNumber,
      lifecycleState:'ACTIVE'},
    qaProject:{projectId:q.qa,projectNumber:q.qaNumber,lifecycleState:'ACTIVE'},
    qaBilling:{billingEnabled:false},
    qaFirestore:{name:'projects/'+q.qa+'/databases/(default)',
      state:'READY',type:'FIRESTORE_NATIVE'},
    previewProvider:{state:'ACTIVE',disabled:false,
      oidc:{issuerUri:q.issuer,allowedAudiences:[q.audience]},
      attributeMapping:{'google.subject':'assertion.sub'},
      attributeCondition:"assertion.sub == '"+q.subject+
        "' && assertion.project_id == '"+q.projectId+"'"},
    qaServiceAccount:{name:'projects/'+q.qa+'/serviceAccounts/'+q.email,
      email:q.email,disabled:false},
    previewServiceAccountIam:{bindings:[
      {role:'roles/iam.workloadIdentityUser',members:[subject]}]},
    qaProjectIam:{bindings:[
      {role:'roles/datastore.user',members:[member]},
      {role:'roles/firebaseauth.viewer',members:[member]}]},
    identityProjectIam:{bindings:[{role:'roles/viewer',
      members:['serviceAccount:independent-production@example.com']}]},
  };
}
test('exact QA preview federation, roles and disabled billing are configuration-only evidence',()=>{
 const result=evaluateQaPreviewWifEvidence(fixture());
 assert.equal(result.decision,'CONFIG_VERIFIED_ONLY');
 assert.equal(result.qaBillingDisabled,true);
 assert.equal(result.liveStsAcceptance,'UNVERIFIED');
 assert.equal(result.qaFirebaseAuthTokenAcceptance,'UNVERIFIED');
 assert.equal(result.officialSimulationAcceptance,'UNVERIFIED');
 assert.equal(result.fiscalDispatch,'DISABLED');
 assert(!JSON.stringify(result).includes('@lourex-fiscal-qa'));
});
test('fail closed for missing IAM, expanded principal, wrong issuer, wrong project or missing QA isolation',()=>{
 const checks=[
   o=>{o.qaProject.projectId='lourex-invoice';},
   o=>{o.identityProject.projectNumber='123';},
   o=>{o.qaProject.lifecycleState='DELETE_REQUESTED';},
   o=>{o.qaBilling.billingEnabled=true;},
   o=>{o.qaBilling={};},
   o=>{o.qaFirestore.type='DATASTORE_MODE';},
   o=>{o.qaFirestore.state='CREATING';},
   o=>{o.previewProvider.oidc.issuerUri='https://attacker.example';},
   o=>{o.previewProvider.oidc.allowedAudiences.push('https://example.org');},
   o=>{o.previewProvider.attributeMapping['google.subject']='assertion.email';},
   o=>{o.previewProvider.attributeCondition='true';},
   o=>{o.previewProvider.disabled=true;},
   o=>{o.previewServiceAccountIam.bindings[0].members.push(
       'principalSet://iam.googleapis.com/projects/985119320046/locations/global/workloadIdentityPools/lourex-vercel/*');},
   o=>{o.previewServiceAccountIam.bindings[0].role='roles/iam.serviceAccountTokenCreator';},
   o=>{o.qaServiceAccount.email='foreign@example.com';},
   o=>{o.qaServiceAccount.disabled=true;},
   o=>{o.qaProjectIam.bindings.pop();},
   o=>{o.qaProjectIam.bindings.push({role:'roles/owner',
        members:['serviceAccount:'+FISCAL_QA_WIF.email]});},
   o=>{o.identityProjectIam.bindings.push({role:'roles/viewer',
        members:['serviceAccount:'+FISCAL_QA_WIF.email]});},
   o=>{o.qaProjectIam.bindings[0].condition={title:'expiring',expression:'request.time < timestamp("2030-01-01T00:00:00Z")'};},
 ];
 for(const change of checks){
   const f=fixture();change(f);
   assert.throws(()=>evaluateQaPreviewWifEvidence(f),{
     message:'LOUREX_QA_PREVIEW_ATTESTATION_HOLD'});
 }
});
test('an incomplete, unverified or malformed snapshot is never accepted',()=>{
 for(const x of [null,{},[],{previewProvider:{}},
  {...fixture(),previewServiceAccountIam:{bindings:[]}},
  {...fixture(),qaProjectIam:{bindings:[{role:'roles/datastore.user',members:'*'}]}}]){
   assert.throws(()=>evaluateQaPreviewWifEvidence(x),
     /LOUREX_QA_PREVIEW_ATTESTATION_HOLD/);
 }
});
test('operator CLI contains only fixed read-only gcloud inspections',async()=>{
 const text=await readFile(new URL('../scripts/fiscal/audit-google-qa-preview-wif.mjs',import.meta.url),'utf8');
 assert.match(text,/spawnSync\('gcloud'/);
 assert.doesNotMatch(text,/\['(create|update|delete|set-iam-policy|add-iam-policy-binding|enable)'/);
 assert.match(text,/LIVE STS\/FIREBASE AUTH\/SIMULATION: UNVERIFIED/);
 assert.match(text,/NO IAM WRITES, NO BILLING CHANGES, NO FISCAL DISPATCH/);
});
