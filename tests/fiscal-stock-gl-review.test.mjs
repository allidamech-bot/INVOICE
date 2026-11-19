import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPublishedStockGlReview,stockGlReviewKey} from '../api/_fiscal/stock-gl-review.mjs';
import {reviewDigest} from '../api/_fiscal/commercial-source.js';
const scope={accountUid:'u',workspaceId:'w',egsId:'e',environment:'simulation'};
const branchId='b',itemId='i',today='2026-11-19',date='2026-11-01';
function fixture(){
 const movement={id:'m',workspaceId:'w',branchId,itemId,date},payload={workspaces:[{id:'w'}],branches:[{id:branchId,workspaceId:'w'}],savedItems:[{id:itemId,workspaceId:'w',branchId}],inventoryMovements:[movement],purchases:[],documents:[]};
 const source={payload,meta:{revision:'revision-1234',sha256:'a'.repeat(64)},control:{generation:7},closedThrough:null};
 const policy={workspaceId:'w',branchId,itemId,warehouseId:'wh',functionalCurrency:'SAR',proposedAsOfDate:today};
 const controls={workspaceId:'w',branchId,functionalCurrency:'SAR',asOfDate:today,currencyMinorDigits:2,inventoryAssetAccountId:'asset',supplierPayableAccountId:'ap',salesCogsAccountId:'cogs'};
 const orderedMovementIds=['m'],review={...scope,state:'approved',sourceRevision:source.meta.revision,sourceSha256:source.meta.sha256,periodGeneration:7,policy,controls,orderedMovementIds,policyDigest:reviewDigest({policy,controls,orderedMovementIds})};
 const f={review,source,blocked:false};
 const db={doc:path=>({path})},tx={get:async ref=>{assert.equal(ref.path,'fiscalPrivateV1/u/workspaces/w/stockGlReviews/'+stockGlReviewKey(branchId,itemId));return {exists:!!f.review,data:()=>f.review};}};
 const loadCompiledFinance=async name=>({
  inventoryCutover:{auditInventoryValuationCutover:()=>({evidenceCoverage:f.blocked?'INCOMPLETE':'COMPLETE_FOR_SUPPORTED_SCOPED_EVENTS',blockers:[{code:'NO_POSTED_GENERAL_LEDGER'}]})},
  valuationEvidence:{projectPostedValuationEvidence:()=>({steps:[{id:'m',kind:'receipt',valueChange:'5.000000000000'}]})},
  sourceBoundGl:{inspectSourceBoundStockGl:(_c,_e,j)=>({sourceMatchedWithinSyntheticEvidence:true,sourceMovementCount:j.length,productionReady:false,trialBalance:{sourceJournalCount:j.length,totalDebitBalances:'5.00',totalCreditBalances:'5.00',productionReady:false}})}
 })[name];
 f.run=()=>inspectPublishedStockGlReview({db,tx,scope,source,branchId,itemId,today,loadCompiledFinance});return f;
}
test('missing policy fails closed without fabricated balances or journal',async()=>{const f=fixture();f.review=null;const x=await f.run();assert.equal(x.status,'blocked');assert.deepEqual(x.blockers,['MISSING_POLICY_EVIDENCE']);assert.equal(x.glPosted,false);});
test('exact approved inputs run the existing GL contract as a nonposted rehearsal',async()=>{const x=await fixture().run();assert.equal(x.status,'rehearsed');assert.equal(x.candidateJournalCount,1);assert.equal(x.trialDebit,'5.00');assert.equal(x.trialCredit,'5.00');assert.equal(x.productionReady,false);assert.equal(x.glPosted,false);});
test('stale generation, scope, digest and omitted source fail closed',async()=>{for(const change of [f=>f.review.periodGeneration++,f=>f.review.policy.branchId='other',f=>f.review.policyDigest='bad',f=>f.review.orderedMovementIds=[],f=>f.source.payload.savedItems[0].branchId='other']){const f=fixture();change(f);await assert.rejects(f.run(),/FISCAL_STOCK_GL_REVIEW_INVALID/);}});
test('unsupported evidence or closed period cannot rehearse an append',async()=>{const f=fixture();f.blocked=true;assert.equal((await f.run()).status,'blocked');f.blocked=false;f.source.closedThrough=date;const x=await f.run();assert.equal(x.status,'blocked');assert.ok(x.blockers.includes('GL_SOURCE_OR_PERIOD_RECONCILIATION_REQUIRED'));});
