import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPublishedStockGlReview,stockGlReviewKey,provisionIndependentStockGlReview} from '../api/_fiscal/stock-gl-review.mjs';
import {reviewDigest} from '../api/_fiscal/commercial-source.js';
import {createHash} from 'node:crypto';
const scope={accountUid:'u',workspaceId:'w',egsId:'e',environment:'simulation'};
const branchId='b',itemId='i',today='2026-11-19',date='2026-11-01';
function fixture(){
 const movement={id:'m',workspaceId:'w',branchId,itemId,date},payload={workspaces:[{id:'w'}],branches:[{id:branchId,workspaceId:'w'}],savedItems:[{id:itemId,workspaceId:'w',branchId}],inventoryMovements:[movement],purchases:[],documents:[]};
 const source={payload,meta:{revision:'revision-1234',sha256:'a'.repeat(64)},control:{generation:7},closedThrough:null};
 const policy={workspaceId:'w',branchId,itemId,warehouseId:'wh',functionalCurrency:'SAR',proposedAsOfDate:today};
 const controls={workspaceId:'w',branchId,functionalCurrency:'SAR',asOfDate:today,currencyMinorDigits:2,inventoryAssetAccountId:'asset',supplierPayableAccountId:'ap',salesCogsAccountId:'cogs'};
 const orderedMovementIds=['m'],review={...scope,state:'approved',sourceRevision:source.meta.revision,sourceSha256:source.meta.sha256,periodGeneration:7,policy,controls,orderedMovementIds,policyDigest:reviewDigest({policy,controls,orderedMovementIds})};
 const f={review,source,blocked:false,independent:null,approved:null};
 const base='fiscalPrivateV1/u/workspaces/w/',reviewPath=base+'stockGlReviews/'+stockGlReviewKey(branchId,itemId);
 const currentKey=()=>reviewDigest([branchId,itemId,source.meta.revision,source.meta.sha256,source.control.generation,today]);
 const records=new Map();
 const db={doc:path=>({path})},tx={get:async ref=>{assert.ok([reviewPath,base+'stockGlApprovedReviews/'+currentKey(),base+'stockGlIndependentEvidence/'+currentKey()].includes(ref.path));const v=ref.path===reviewPath?f.review:records.get(ref.path);return {exists:!!v,data:()=>v};},create(ref,v){assert.ok([base+'stockGlApprovedReviews/'+currentKey(),base+'stockGlIndependentEvidence/'+currentKey()].includes(ref.path));assert.equal(records.has(ref.path),false);records.set(ref.path,v);}};
 Object.defineProperties(f,{approved:{get:()=>records.get(base+'stockGlApprovedReviews/'+currentKey())??null},independent:{get:()=>records.get(base+'stockGlIndependentEvidence/'+currentKey())??null}});
 const loadCompiledFinance=async name=>({
  inventoryCutover:{auditInventoryValuationCutover:()=>({evidenceCoverage:f.blocked?'INCOMPLETE':'COMPLETE_FOR_SUPPORTED_SCOPED_EVENTS',blockers:[{code:'NO_POSTED_GENERAL_LEDGER'}]})},
  valuationEvidence:{projectPostedValuationEvidence:()=>({steps:[{id:'m',kind:'receipt',valueChange:'5.000000000000'}]})},
  sourceBoundGl:{inspectSourceBoundStockGl:(_c,_e,j)=>({sourceMatchedWithinSyntheticEvidence:true,sourceMovementCount:j.length,productionReady:false,trialBalance:{sourceJournalCount:j.length,totalDebitBalances:'5.00',totalCreditBalances:'5.00',productionReady:false}})}
 })[name];
 f.args={db,tx,scope,source,branchId,itemId,today,loadCompiledFinance};f.run=()=>inspectPublishedStockGlReview(f.args);return f;
}
test('missing policy fails closed without fabricated balances or journal',async()=>{const f=fixture();f.review=null;const x=await f.run();assert.equal(x.status,'blocked');assert.deepEqual(x.blockers,['MISSING_POLICY_EVIDENCE']);assert.equal(x.glPosted,false);});
test('exact approved inputs run the existing GL contract as a nonposted rehearsal',async()=>{const x=await fixture().run();assert.equal(x.status,'rehearsed');assert.equal(x.candidateJournalCount,1);assert.equal(x.trialDebit,'5.00');assert.equal(x.trialCredit,'5.00');assert.equal(x.productionReady,false);assert.equal(x.glPosted,false);});
test('stale generation, scope, digest and omitted source fail closed',async()=>{for(const change of [f=>f.review.periodGeneration++,f=>f.review.policy.branchId='other',f=>f.review.policyDigest='bad',f=>f.review.orderedMovementIds=[],f=>f.source.payload.savedItems[0].branchId='other']){const f=fixture();change(f);await assert.rejects(f.run(),/FISCAL_STOCK_GL_REVIEW_INVALID/);}});
test('unsupported evidence or closed period cannot rehearse an append',async()=>{const f=fixture();f.blocked=true;assert.equal((await f.run()).status,'blocked');f.blocked=false;f.source.closedThrough=date;const x=await f.run();assert.equal(x.status,'blocked');assert.ok(x.blockers.includes('GL_SOURCE_OR_PERIOD_RECONCILIATION_REQUIRED'));});

function independentFixture(){
 const f=fixture(),bytes=Buffer.from('synthetic independent proof, not actual reviewer evidence');
 const policy={...f.review.policy,proposedBy:scope.accountUid,openingBasis:'verified-zero',costingMethod:'moving-weighted-average',itemClass:'interchangeable'};
 const controls={...f.review.controls,inventoryAllowanceAccountId:'allowance',impairmentExpenseAccountId:'impairment'},orderedMovementIds=['m'];
 const journal=[{id:'gl-'+reviewDigest([scope.workspaceId,branchId,'m']),sourceKind:'purchase-receipt',sourceMovementId:'m',effectiveDate:date,workspaceId:scope.workspaceId,branchId,currency:'SAR',lines:[{accountId:'asset',direction:'debit',amount:'5.00'},{accountId:'ap',direction:'credit',amount:'5.00'}]}];
 const trialBalance=['allowance','ap','asset','cogs','impairment'].map(accountId=>({accountId,debitBalance:accountId==='asset'?'5.00':'0.00',creditBalance:accountId==='ap'?'5.00':'0.00'}));
 const proof={...scope,branchId,itemId,asOfDate:today,sourceRevision:f.source.meta.revision,sourceSha256:f.source.meta.sha256,periodGeneration:7,policy,controls,orderedMovementIds,policyDigest:reviewDigest({policy,controls,orderedMovementIds}),valid:true,bundleDigest:createHash('sha256').update(bytes).digest('hex'),currency:'SAR',openingQuantity:'0.00',openingValue:'0.00',netRealisableValue:'6.00',journalDigest:reviewDigest(journal),trialBalance};
 for(const [i,k] of ['policyEvidenceDigest','functionalCurrencyEvidenceDigest','openingEvidenceDigest','ownerApprovalDigest','nrvEvidenceDigest','independentTrialBalanceDigest'].entries())proof[k]=String(i+1).repeat(64);
 f.review=null;return {f,bytes,proof,provision:(p=proof)=>provisionIndependentStockGlReview(f.args,bytes,p)};
}
test('independent policy, opening, NRV and exact trial balance provision a read-only audited reconciliation',async()=>{
 const {f,provision}=independentFixture();const first=await provision();assert.equal(first.status,'verified-reconciliation');assert.equal(first.glPosted,false);assert.equal(first.productionReady,false);assert.deepEqual(await provision(),first);
 const report=await f.run();assert.equal(report.independentTrialBalanceMatched,true);assert.equal(report.glPosted,false);assert.equal(report.internalCandidate,undefined);assert.equal(report.independentEvidenceDigest,first.evidenceDigest);
 const old=f.independent;f.source.meta.revision='revision-new';assert.equal((await f.run()).status,'blocked');assert.equal(f.independent,null);f.source.meta.revision='revision-1234';assert.equal(f.independent,old);
 f.independent.bytes=Buffer.from('changed').toString('base64');await assert.rejects(f.run());
});
test('stale or unapproved evidence, mismatched accounts, write-down and altered source do not provision',async()=>{
 for(const patch of [{valid:false},{periodGeneration:6},{sourceRevision:'old'},{currency:'USD'},{netRealisableValue:'4.99'},{openingQuantity:'1.00'},{openingValue:'0.01'},{journalDigest:'c'.repeat(64)},{ownerApprovalDigest:'1'.repeat(64)},{bundleDigest:'f'.repeat(64)},{trialBalance:[]}]){
  const {f,proof,provision}=independentFixture();await assert.rejects(provision({...proof,...patch}));assert.equal(f.approved,null);assert.equal(f.independent,null);
 }
 const {f,provision}=independentFixture();f.source.closedThrough=date;await assert.rejects(provision());assert.equal(f.approved,null);
});
