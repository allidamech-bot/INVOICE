import {reviewDigest} from './commercial-source.js';
import {simulationBase} from './simulation-scope.js';
import {prototypeFinanceGlAtomicAppend,fingerprintSyntheticFinanceSources,fingerprintSyntheticFinanceControls} from '../_accounting/finance-gl-atomic-contract.js';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const need=ok=>{if(!ok)throw Error('FISCAL_STOCK_GL_REVIEW_INVALID');};
const data=x=>x.exists?x.data():null;
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const money=x=>{need(typeof x==='string'&&/^\d+\.\d{12}$/.test(x)&&x.endsWith('0000000000'));return x.slice(0,-10);};
export const stockGlReviewKey=(branchId,itemId)=>reviewDigest([branchId,itemId]);
// Read-only synthetic audit. Approval of the inputs does not authenticate
// the accountant, NRV estimates, functional currency or a posted GL.
export async function inspectPublishedStockGlReview({db,tx,scope,source,branchId,itemId,loadCompiledFinance,today}){
 const base=simulationBase(scope),payload=source.payload;
 need(ID.test(branchId)&&ID.test(itemId)&&day(today)&&Array.isArray(payload.inventoryMovements));
 const result={format:'LOUREX_FISCAL_STOCK_GL_REVIEW_V1',environment:'simulation',workspaceId:scope.workspaceId,branchId,itemId,sourceRevision:source.meta.revision,periodGeneration:source.control.generation,sourceSnapshotVerified:true,productionReady:false,glPosted:false};
 const inScope=m=>m.workspaceId===scope.workspaceId&&m.branchId===branchId&&m.itemId===itemId;
 const movements=payload.inventoryMovements.filter(inScope);
 const matches=payload.savedItems.filter(x=>x.id===itemId);
 need(payload.workspaces.filter(x=>x.id===scope.workspaceId).length===1&&payload.branches.filter(x=>x.id===branchId&&x.workspaceId===scope.workspaceId).length===1&&matches.length===1&&inScope({...matches[0],itemId:matches[0].id}));
 const ref=db.doc(base+'/stockGlReviews/'+stockGlReviewKey(branchId,itemId)),review=data(await tx.get(ref));
 if(!review)return {...result,status:'blocked',blockers:['MISSING_POLICY_EVIDENCE']};
 const policy=review.policy,controls=review.controls;
 need(review.state==='approved'&&review.accountUid===scope.accountUid&&review.workspaceId===scope.workspaceId&&review.egsId===scope.egsId&&review.environment==='simulation'
  &&review.sourceRevision===source.meta.revision&&review.sourceSha256===source.meta.sha256&&review.periodGeneration===source.control.generation
  &&policy?.itemId===itemId&&policy.workspaceId===scope.workspaceId&&policy.branchId===branchId&&policy.proposedAsOfDate===today
  &&controls?.workspaceId===scope.workspaceId&&controls.branchId===branchId&&controls.functionalCurrency===policy.functionalCurrency&&controls.asOfDate===today&&controls.currencyMinorDigits===2
  &&Array.isArray(review.orderedMovementIds)&&review.orderedMovementIds.length===movements.length&&movements.length<=100&&new Set(review.orderedMovementIds).size===movements.length
  &&movements.every(m=>review.orderedMovementIds.includes(m.id))&&review.policyDigest===reviewDigest({policy,controls,orderedMovementIds:review.orderedMovementIds}));
 // Never infer order, opening balances, or currency from the workspace.
 const evidence={scope:{workspaceId:scope.workspaceId,branchId,itemId,warehouseId:policy.warehouseId,functionalCurrency:policy.functionalCurrency},orderedMovementIds:review.orderedMovementIds,movements:payload.inventoryMovements,purchases:payload.purchases,documents:payload.documents};
 const [{auditInventoryValuationCutover},{projectPostedValuationEvidence},{inspectSourceBoundStockGl}]=await Promise.all(['inventoryCutover','valuationEvidence','sourceBoundGl'].map(loadCompiledFinance));
 const audit=auditInventoryValuationCutover({vault:payload,policy,evidence});
 const blockers=audit.blockers.map(b=>b.code);
 const answer={...result,audit,blockers,status:'blocked'};
 if(audit.evidenceCoverage!=='COMPLETE_FOR_SUPPORTED_SCOPED_EVENTS'||movements.length===0)return answer;
 // The existing narrow GL foundation only supports exact, same-currency,
 // single-line purchase and issue history. It must reject VAT/FX/NRV gaps.
 try{
  const projection=projectPostedValuationEvidence(evidence);
  need(projection.steps.length===movements.length);
  const byId=new Map(movements.map(m=>[m.id,m]));
  const append=projection.steps.map(step=>{
   need(['receipt','issue'].includes(step.kind));const m=byId.get(step.id);need(m);
   const receipt=step.kind==='receipt',amount=money(receipt?step.valueChange:step.costOfGoodsSold);
   return {id:'gl-'+reviewDigest([scope.workspaceId,branchId,step.id]),sourceKind:receipt?'purchase-receipt':'sales-stock-issue',sourceMovementId:step.id,effectiveDate:m.date,workspaceId:scope.workspaceId,branchId,currency:controls.functionalCurrency,lines:[{accountId:receipt?controls.inventoryAssetAccountId:controls.salesCogsAccountId,direction:'debit',amount},{accountId:receipt?controls.supplierPayableAccountId:controls.inventoryAssetAccountId,direction:'credit',amount}]};
  });
  const sourceSha256=fingerprintSyntheticFinanceSources(evidence),controlsSha256=fingerprintSyntheticFinanceControls(controls);
  const state={authorityPresent:true,ownerUid:scope.accountUid,workspaceId:scope.workspaceId,branchId,periodGeneration:source.control.generation,ledgerVersion:0,closedThrough:source.closedThrough,sourceSha256,controlsSha256,journals:[],receipts:[]};
  const command={opId:'gl-'+reviewDigest([source.meta.revision,branchId,itemId]),workspaceId:scope.workspaceId,branchId,expectedLedgerVersion:0,expectedPeriodGeneration:source.control.generation,expectedSourceSha256:sourceSha256,append};
  const candidate=prototypeFinanceGlAtomicAppend({state,identity:{uid:scope.accountUid,role:'owner'},command,sourceEvidence:evidence,controls,verifySourceBoundGl:inspectSourceBoundStockGl});
  // The candidate is deliberately NOT persisted or represented as a live GL.
  return {...answer,status:'rehearsed',candidateJournalCount:candidate.state.journals.length,trialDebit:candidate.receipt.trialDebit,trialCredit:candidate.receipt.trialCredit};
 }catch{return {...answer,blockers:[...new Set([...blockers,'GL_SOURCE_OR_PERIOD_RECONCILIATION_REQUIRED'])]};}
}
