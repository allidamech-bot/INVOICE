import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProductionProvisioningBridge} from '../api/_fiscal/production-provisioning-bridge.js';
import {fiscalCompanySourceDigest} from '../api/_fiscal/production-profile.js';

const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scope={accountUid:'owner-1',workspaceId:'company-1',branchId:'branch-1'};
const company={country:'SA',nameAr:'شركة اختبار',nameEn:'Synthetic',
  vatNumber:'300000000000003',commercialRegistration:'1010123456',
  addressAr:'Riyadh',city:'Riyadh'};
const clock=()=> '2026-11-21T12:00:00.000Z';
function fixture(overrides={}){
 const base='fiscalProductionV1/'+scope.accountUid+'/workspaces/'+scope.workspaceId;
 const rows=new Map([
  [base+'/profiles/current',{environment:'production',accountUid:scope.accountUid,
    workspaceId:scope.workspaceId,state:'pending-verification',version:1,
    sourceDigest:fiscalCompanySourceDigest(company)}],
  [base+'/provisioningRequests/'+scope.branchId,{environment:'production',
    ...scope,profileVersion:1,sourceDigest:fiscalCompanySourceDigest(company),
    functionalityMap:'1100',businessCategory:'Retail',state:'pending'}],
 ]);
 const workspaces=new Map([[scope.accountUid+'/'+scope.workspaceId,{
   company:{...company},branches:[{id:scope.branchId,workspaceId:scope.workspaceId,active:true}]}]]);
 const counts={operator:0,eligibility:0,key:0,registered:0,db:0};
 const db={doc:p=>p,runTransaction:async fn=>{counts.db++;return fn({
    get:async p=>({exists:rows.has(p),data:()=>structuredClone(rows.get(p))})
  });}};
 const loadWorkspace=async(_tx,s)=>{
   const w=workspaces.get(s.accountUid+'/'+s.workspaceId);
   if(!w)throw Error('NO_WORKSPACE');
   return structuredClone(w);
 };
 const authorizeOperator=async(s,ctx)=>{counts.operator++;return ctx==='trusted-operator'&&
   JSON.stringify(s)===JSON.stringify(scope);};
 const verifyTaxpayerEligibility=async s=>{
   counts.eligibility++;
   return {eligible:true,...Object.fromEntries(['accountUid','workspaceId','branchId',
     'profileVersion','sourceDigest','vatNumber','commercialRegistration'].map(k=>[k,s[k]])),
     eligibilityEvidenceDigest:'a'.repeat(64),verifiedAt:clock()};
 };
 const resolveApprovedHsmKey=async s=>{
   counts.key++;
   return {...Object.fromEntries(['accountUid','workspaceId','branchId',
     'profileVersion','sourceDigest'].map(k=>[k,s[k]])),
     idempotencyKey:s.idempotencyKey,
     keyVersion:'projects/lourex-invoice/locations/global/keyRings/fiscal/cryptoKeys/branch-1/cryptoKeyVersions/1',
     organizationUnit:'Riyadh',effectiveFrom:'2026-11-20'};
 };
 const registerVerifiedUnit=async(identity,input)=>{
   counts.registered++;
   assert.deepEqual(identity,{uid:scope.accountUid,role:'owner'});
   assert.deepEqual(input,{
     workspaceId:scope.workspaceId,branchId:scope.branchId,
     keyVersion:'projects/lourex-invoice/locations/global/keyRings/fiscal/cryptoKeys/branch-1/cryptoKeyVersions/1',
     eligibilityEvidenceDigest:'a'.repeat(64),effectiveFrom:'2026-11-20',
     organizationUnit:'Riyadh',expectedProfileVersion:1
   });
   const egsId='egs-'+sha([scope.accountUid,scope.workspaceId,scope.branchId]).slice(0,40);
   rows.set(base+'/provisioningRequests/'+scope.branchId,
     {...rows.get(base+'/provisioningRequests/'+scope.branchId),state:'registered',egsId});
   rows.set(base+'/egs/'+egsId,{
     environment:'production',...scope,egsId,unit:{egsId},
     state:'enrolling',profileVersion:1,
     issuer:{accountUid:scope.accountUid,workspaceId:scope.workspaceId,
       vatNumber:company.vatNumber,legalName:company.nameAr},
     registrationDigest:'d'.repeat(64),eligibilityEvidenceDigest:'a'.repeat(64)
   });
   return {state:'enrolling',egsId};
 };
 const opts={db,loadWorkspace,authorizeOperator,verifyTaxpayerEligibility,
    resolveApprovedHsmKey,registerVerifiedUnit,clock,...overrides};
 return {run:createProductionProvisioningBridge(opts),counts,rows,workspaces,
   base,opts};
}
test('independent taxpayer verification and pinned HSM request precede registration',async()=>{
 const f=fixture();
 const result=await f.run(scope,'trusted-operator');
 assert.equal(result.state,'provisioned-for-onboarding');
 assert.match(result.egsId,/^egs-[a-f0-9]{40}$/);
 assert.deepEqual({eligibility:f.counts.eligibility,key:f.counts.key,registered:f.counts.registered},
   {eligibility:1,key:1,registered:1});
 assert.equal(JSON.stringify(result).includes('eligibilityEvidenceDigest'),false);
 const retry=await f.run(scope,'trusted-operator');
 assert.deepEqual(retry,{state:'already-provisioned',egsId:result.egsId});
 assert.equal(f.counts.key,1);
 assert.equal(f.counts.registered,1);
});
test('only a separately authorized operator may enter the private provisioning boundary',async()=>{
 const f=fixture();
 await assert.rejects(f.run(scope,'browser-token'),/PRODUCTION_PROVISIONING_FORBIDDEN/);
 await assert.rejects(f.run({...scope,accountUid:'other'},'trusted-operator'),/PRODUCTION_PROVISIONING_FORBIDDEN/);
 await assert.rejects(f.run({...scope,keyVersion:'browser-chosen'},'trusted-operator'),/PRODUCTION_PROVISIONING_FORBIDDEN/);
 assert.equal(f.counts.db,0);
 assert.equal(f.counts.key,0);
 assert.equal(f.counts.registered,0);
});
test('missing tenant request, changed VAT or stale profile fails before external approval',async()=>{
 for(const change of [
  f=>f.rows.delete(f.base+'/provisioningRequests/'+scope.branchId),
  f=>{f.workspaces.get(scope.accountUid+'/'+scope.workspaceId).company.vatNumber='300000000000013';},
  f=>{f.rows.get(f.base+'/profiles/current').version=2;},
 ]){
  const f=fixture();change(f);
  await assert.rejects(f.run(scope,'trusted-operator'),/PRODUCTION_PROVISIONING_(SOURCE_CHANGED|REQUEST_REQUIRED)/);
  assert.equal(f.counts.eligibility,0);assert.equal(f.counts.registered,0);
 }
});
test('the evidence checker cannot approve a different tenant, expired approval or mere claim',async()=>{
 const good=fixture();
 for(const approval of [
  {...await good.opts.verifyTaxpayerEligibility({accountUid:scope.accountUid,workspaceId:scope.workspaceId,branchId:scope.branchId,
     profileVersion:1,sourceDigest:fiscalCompanySourceDigest(company),vatNumber:company.vatNumber,commercialRegistration:company.commercialRegistration}),vatNumber:'399999999999993'},
  {eligible:true},
  {eligible:false},
 ]){
  const f=fixture({verifyTaxpayerEligibility:async()=>approval});
  await assert.rejects(f.run(scope,'trusted-operator'),/PRODUCTION_ELIGIBILITY_UNVERIFIED/);
  assert.equal(f.counts.key,0);assert.equal(f.counts.registered,0);
 }
 const f=fixture({verifyTaxpayerEligibility:async s=>({...s,eligible:true,
   eligibilityEvidenceDigest:'b'.repeat(64),verifiedAt:'2026-11-20T00:00:00.000Z'})});
 await assert.rejects(f.run(scope,'trusted-operator'),/PRODUCTION_ELIGIBILITY_UNVERIFIED/);
});
test('hardware key allocation must replay a stable server-computed idempotency key',async()=>{
 const f=fixture({resolveApprovedHsmKey:async s=>({
   ...s,idempotencyKey:'false',organizationUnit:'Riyadh',effectiveFrom:'2026-11-20',
   keyVersion:'projects/evil/locations/global/keyRings/test/cryptoKeys/key/cryptoKeyVersions/1'})});
 await assert.rejects(f.run(scope,'trusted-operator'),/PRODUCTION_HSM_NOT_VERIFIED/);
 assert.equal(f.counts.registered,0);
});
test('customer source modification between eligibility approval and registration blocks activation',async()=>{
 const f=fixture();
 const run=createProductionProvisioningBridge({...f.opts,
   resolveApprovedHsmKey:async s=>{
     f.workspaces.get(scope.accountUid+'/'+scope.workspaceId).company.nameAr='شركة أخرى';
     return f.opts.resolveApprovedHsmKey(s);
   }});
 await assert.rejects(run(scope,'trusted-operator'),/PRODUCTION_PROVISIONING_SOURCE_CHANGED/);
 assert.equal(f.counts.registered,0);
});
test('missing trusted operator, eligibility or key capability cannot construct a bridge',()=>{
 const f=fixture();
 for(const missing of ['authorizeOperator','verifyTaxpayerEligibility','resolveApprovedHsmKey']){
   assert.throws(()=>createProductionProvisioningBridge({...f.opts,[missing]:undefined}),
     /PRODUCTION_PROVISIONING_UNAVAILABLE/);
 }
});

test('registered request marker without the matching EGS cannot claim prior success',async()=>{
 for(const tamper of [
   (f,id)=>f.rows.delete(f.base+'/egs/'+id),
   (f,id)=>{f.rows.get(f.base+'/egs/'+id).accountUid='foreign-tenant';},
   (f,id)=>{f.rows.get(f.base+'/egs/'+id).issuer.vatNumber='399999999999993';},
   (f,id)=>{f.rows.get(f.base+'/egs/'+id).issuer.legalName='Another company';},
   (f,id)=>{f.rows.get(f.base+'/egs/'+id).state='revoked';},
   (f,id)=>{f.rows.get(f.base+'/egs/'+id).registrationDigest='invalid';},
 ]){
  const f=fixture(),result=await f.run(scope,'trusted-operator');
  tamper(f,result.egsId);
  await assert.rejects(f.run(scope,'trusted-operator'),
    /PRODUCTION_PROVISIONING_SOURCE_CHANGED/);
  assert.equal(f.counts.key,1);
  assert.equal(f.counts.registered,1);
 }
});
test('an immutable security hold prevents a registered EGS from looking provisionable',async()=>{
 const f=fixture(),result=await f.run(scope,'trusted-operator');
 f.rows.set(f.base+'/egs/'+result.egsId+'/security/hold',{
   environment:'production',...scope,egsId:result.egsId,
   state:'held',reason:'certificate-revoked',evidenceDigest:'e'.repeat(64)
 });
 await assert.rejects(f.run(scope,'trusted-operator'),/PRODUCTION_SECURITY_HOLD/);
 assert.equal(f.counts.key,1);
 assert.equal(f.counts.registered,1);
});
