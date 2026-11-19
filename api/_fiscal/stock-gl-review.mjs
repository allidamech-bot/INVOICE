import {createHash} from 'node:crypto';
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
async function evaluate({db,tx,scope,source,branchId,itemId,loadCompiledFinance,today,proposedReview}){
 const base=simulationBase(scope),payload=source.payload;
 need(ID.test(branchId)&&ID.test(itemId)&&day(today)&&Array.isArray(payload.inventoryMovements));
 const result={format:'LOUREX_FISCAL_STOCK_GL_REVIEW_V1',environment:'simulation',workspaceId:scope.workspaceId,branchId,itemId,sourceRevision:source.meta.revision,periodGeneration:source.control.generation,sourceSnapshotVerified:true,productionReady:false,glPosted:false};
 const inScope=m=>m.workspaceId===scope.workspaceId&&m.branchId===branchId&&m.itemId===itemId;
 const movements=payload.inventoryMovements.filter(inScope);
 const matches=payload.savedItems.filter(x=>x.id===itemId);
 need(payload.workspaces.filter(x=>x.id===scope.workspaceId).length===1&&payload.branches.filter(x=>x.id===branchId&&x.workspaceId===scope.workspaceId).length===1&&matches.length===1&&inScope({...matches[0],itemId:matches[0].id}));
 const ref=db.doc(base+'/stockGlReviews/'+stockGlReviewKey(branchId,itemId)),review=proposedReview??data(await tx.get(ref));
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
  return {...answer,status:'rehearsed',candidateJournalCount:candidate.state.journals.length,trialDebit:candidate.receipt.trialDebit,trialCredit:candidate.receipt.trialCredit,internalCandidate:candidate.state.journals,internalEvidence:evidence,internalControls:controls};
 }catch{return {...answer,blockers:[...new Set([...blockers,'GL_SOURCE_OR_PERIOD_RECONCILIATION_REQUIRED'])]};}
}

const HEX=/^[a-f0-9]{64}$/;
const amount=x=>typeof x==='string'&&/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(x);
const cents=x=>BigInt(x.replace('.',''));
const same=(a,b)=>reviewDigest(a)===reviewDigest(b);
const scoped=(a,s)=>a&&['accountUid','workspaceId','egsId','environment'].every(k=>a[k]===s[k]);
const hashBytes=bytes=>createHash('sha256').update(bytes).digest('hex');
const independentKey=({branchId,itemId,source,today})=>reviewDigest([branchId,itemId,source.meta.revision,source.meta.sha256,source.control.generation,today]);
const proofKeys=['policyEvidenceDigest','functionalCurrencyEvidenceDigest','openingEvidenceDigest','ownerApprovalDigest','nrvEvidenceDigest','independentTrialBalanceDigest'];
function separateTrialBalance(controls,journals){
 const accounts=[controls.inventoryAssetAccountId,controls.supplierPayableAccountId,controls.salesCogsAccountId,controls.inventoryAllowanceAccountId,controls.impairmentExpenseAccountId];
 need(accounts.every(x=>typeof x==='string'&&ID.test(x))&&new Set(accounts).size===5);
 const sums=new Map(accounts.map(x=>[x,0n]));
 for(const j of journals)for(const l of j.lines){need(sums.has(l.accountId)&&amount(l.amount)&&['debit','credit'].includes(l.direction));sums.set(l.accountId,sums.get(l.accountId)+(l.direction==='debit'?1n:-1n)*cents(l.amount));}
 const fmt=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
 return [...sums].sort(([a],[b])=>a.localeCompare(b)).map(([accountId,n])=>({accountId,debitBalance:fmt(n>0n?n:0n),creditBalance:fmt(n<0n?-n:0n)}));
}
function checkIndependentProof(args,review,proof,calculated){
 const {scope,source,branchId,itemId,today}=args;
 need(scoped(proof,scope)&&proof.branchId===branchId&&proof.itemId===itemId&&proof.asOfDate===today&&proof.sourceRevision===source.meta.revision&&proof.sourceSha256===source.meta.sha256&&proof.periodGeneration===source.control.generation&&proof.policyDigest===review.policyDigest&&proof.valid===true&&HEX.test(proof.bundleDigest??'')&&proofKeys.every(k=>HEX.test(proof[k]??''))&&new Set(proofKeys.map(k=>proof[k])).size===proofKeys.length);
 // The existing two-account GL supports only independently verified zero
 // opening, same currency, WAC, and no required write-down. No inferred NRV.
 need(review.policy.proposedBy===scope.accountUid&&review.policy.openingBasis==='verified-zero'&&review.policy.costingMethod==='moving-weighted-average'&&review.policy.itemClass==='interchangeable'&&proof.currency===review.controls.functionalCurrency&&proof.openingQuantity==='0.00'&&proof.openingValue==='0.00'&&amount(proof.netRealisableValue));
 need(calculated.status==='rehearsed'&&calculated.audit.evidenceCoverage==='COMPLETE_FOR_SUPPORTED_SCOPED_EVENTS'&&Array.isArray(calculated.internalCandidate));
 const trial=separateTrialBalance(calculated.internalControls,calculated.internalCandidate);
 const inventory=trial.find(x=>x.accountId===review.controls.inventoryAssetAccountId);
 need(inventory&&inventory.creditBalance==='0.00'&&cents(proof.netRealisableValue)>=cents(inventory.debitBalance)&&proof.journalDigest===reviewDigest(calculated.internalCandidate)&&Array.isArray(proof.trialBalance)&&same(proof.trialBalance,trial));
 const totals=trial.reduce((a,x)=>[a[0]+cents(x.debitBalance),a[1]+cents(x.creditBalance)],[0n,0n]);
 need(totals[0]===totals[1]&&totals[0]===cents(calculated.trialDebit)&&totals[1]===cents(calculated.trialCredit));
 return {journalDigest:proof.journalDigest,trialBalanceDigest:reviewDigest(trial),evidenceDigest:proof.bundleDigest,trialDebit:calculated.trialDebit,trialCredit:calculated.trialCredit};
}
function publicResult(v){
 const {internalCandidate,internalEvidence,internalControls,...out}=v;return out;
}
// Reuse the original read-only contract. If an independently approved record
// exists, revalidate its byte-bound evidence and recompute the exact trial
// balance before showing that it reconciles. Never present it as a posted GL.
export async function inspectPublishedStockGlReview(args){
 const {db,tx,scope,source}=args,base=simulationBase(scope),key=independentKey(args);
 const review=data(await tx.get(db.doc(base+'/stockGlApprovedReviews/'+key))),row=data(await tx.get(db.doc(base+'/stockGlIndependentEvidence/'+key)));
 need(Boolean(row)===Boolean(review));
 const calculated=await evaluate({...args,proposedReview:review}),out=publicResult(calculated);
 if(!row)return out;
 need(calculated.status==='rehearsed');
 need(row.format==='LOUREX_STOCK_GL_EVIDENCE_V1'&&scoped(row,scope)&&typeof row.bytes==='string'&&row.bytes.length<=670000&&row.proof&&row.proof.bundleDigest===row.digest);
 const bytes=Buffer.from(row.bytes,'base64');
 need(bytes.length>0&&bytes.length<=500000&&bytes.toString('base64')===row.bytes&&hashBytes(bytes)===row.digest);
 const verified=checkIndependentProof(args,review,row.proof,calculated);
 need(same(row.result,verified)&&row.sourceRevision===source.meta.revision);
 return {...out,independentEvidenceMatched:true,independentTrialBalanceMatched:true,independentEvidenceDigest:verified.evidenceDigest,trialBalanceDigest:verified.trialBalanceDigest};
}
// A trusted external verifier supplies approval facts, not a browser. Persist
// immutable generation-specific review and proof together in the source CAS.
// A changed source deliberately requires an independent new review.
export async function provisionIndependentStockGlReview(args,bytes,verified){
 const {db,tx,scope,branchId,itemId,source,today}=args;
 need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=500000&&scoped(verified,scope)&&verified.branchId===branchId&&verified.itemId===itemId&&verified.asOfDate===today&&verified.bundleDigest===hashBytes(bytes));
 const {policy,controls,orderedMovementIds}=verified;
 need(policy&&controls&&Array.isArray(orderedMovementIds)&&Buffer.byteLength(JSON.stringify({policy,controls,orderedMovementIds}))<=64000&&Array.isArray(verified.trialBalance)&&verified.trialBalance.length===5&&Buffer.byteLength(JSON.stringify(verified.trialBalance))<=8192);
 const review={...scope,state:'approved',sourceRevision:source.meta.revision,sourceSha256:source.meta.sha256,periodGeneration:source.control.generation,policy,controls,orderedMovementIds,policyDigest:reviewDigest({policy,controls,orderedMovementIds})};
 const proof=Object.fromEntries(['accountUid','workspaceId','egsId','environment','branchId','itemId','asOfDate','sourceRevision','sourceSha256','periodGeneration','policyDigest','valid','bundleDigest',...proofKeys,'currency','openingQuantity','openingValue','netRealisableValue','journalDigest','trialBalance'].map(k=>[k,verified[k]]));
 const calculated=await evaluate({...args,proposedReview:review}),result=checkIndependentProof(args,review,proof,calculated);
 const base=simulationBase(scope),key=independentKey(args);
 const reviewRef=db.doc(base+'/stockGlApprovedReviews/'+key),evidenceRef=db.doc(base+'/stockGlIndependentEvidence/'+key);
 const prior=data(await tx.get(reviewRef)),old=data(await tx.get(evidenceRef));
 const row={...scope,format:'LOUREX_STOCK_GL_EVIDENCE_V1',sourceRevision:source.meta.revision,digest:proof.bundleDigest,bytes:bytes.toString('base64'),proof,result};
 if(prior||old){need(prior&&old&&same(prior,review)&&same(old,row));return {...result,status:'verified-reconciliation',glPosted:false,productionReady:false};}
 tx.create(reviewRef,review);tx.create(evidenceRef,row);
 return {...result,status:'verified-reconciliation',glPosted:false,productionReady:false};
}
