import {createHash} from 'node:crypto';
import {reviewDigest} from './commercial-source.js';
import {simulationBase} from './simulation-scope.js';
import {projectSupplierCommercialSettlements,supplierRefundCashFacts} from './supplier-commercial-settlements.mjs';
const ID=/^[A-Za-z0-9_-]{1,128}$/,HEX=/^[a-f0-9]{64}$/;
const need=(ok,code='FISCAL_SUPPLIER_SETTLEMENT_REVIEW_REQUIRED')=>{if(!ok)throw Error(code);};
const data=s=>s.exists?s.data():null;
const same=(r,s)=>r&&['accountUid','workspaceId','egsId','environment'].every(k=>r[k]===s[k]);
const sameWorkspace=(r,s)=>r&&['accountUid','workspaceId','environment'].every(k=>r[k]===s[k])&&typeof r.egsId==='string'&&ID.test(r.egsId);
const equal=(a,b)=>reviewDigest(a)===reviewDigest(b);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const hash=v=>createHash('sha256').update(v).digest('hex');
const accountRef=(db,s,collection,id)=>db.doc('fiscalPrivateV1/'+s.accountUid+'/'+collection+'/'+reviewDigest(id));
export const settlementCashClaim=(db,s,id)=>accountRef(db,s,'commercialSettlementCashClaims',id);
const evidenceClaim=(db,s,id)=>accountRef(db,s,'commercialSettlementEvidence',id);
const MAX=200;
async function collectionRows(db,tx,path){
 const snapshot=await tx.get(db.collection(path).limit(MAX+1));need(snapshot.docs.length<=MAX,'FISCAL_REPORT_LIMIT');
 return snapshot.docs.map(x=>({id:x.id,row:x.data()}));
}
async function loadPosted(db,tx,s){
 const base=simulationBase({...s,egsId:s.egsId||'unselected'}),rows=await collectionRows(db,tx,base+'/supplierSettlementPostings');
 for(const {id,row} of rows){
  need(ID.test(id)&&sameWorkspace(row,s)&&row.key==='supplier-settlement-'+id&&row.approval?.id===id&&same(row.approval,row)&&row.approval.state==='approved'&&HEX.test(row.approval.evidenceDigest),'FISCAL_SETTLEMENT_POSTING_CONFLICT');
  const claim=data(await tx.get(evidenceClaim(db,s,row.approval.evidenceDigest)));
  need(same(claim,row)&&claim.key===row.key&&claim.digest===reviewDigest(row.approval),'FISCAL_SETTLEMENT_POSTING_CONFLICT');
  if(['refund','adjusted-payment','adjusted-payment-reversal'].includes(row.approval.kind)){
   const cash=data(await tx.get(settlementCashClaim(db,s,row.approval.treasuryEntryId)));
   need(same(cash,row)&&cash.key===row.key&&cash.cashDigest===row.approval.cashDigest,'FISCAL_SETTLEMENT_POSTING_CONFLICT');
  }
 }
 return rows.map(x=>x.row);
}
async function loadSources(db,tx,s,payload,approvals,extraAdjustment){
 const base=simulationBase(s),keys=[...new Set(approvals.flatMap(a=>[a.sourcePurchaseId,...(a.kind==='offset'?[a.targetPurchaseId]:[])]))];need(keys.length<=MAX&&keys.every(k=>typeof k==='string'&&ID.test(k)));
 const result=[];
 for(const id of keys){
  const matches=payload.purchases.filter(p=>p.id===id&&p.workspaceId===s.workspaceId);need(matches.length===1);
  const purchase=matches[0],original=data(await tx.get(db.doc(base+'/accountingEntries/purchase-'+id)));
  need(same(original,s)&&original.key==='purchase-'+id&&original.source==='purchase'&&original.sourceId===id&&original.amount?.kind==='invoice'&&original.sourceFingerprint===reviewDigest(purchase));
  const snapshot=await tx.get(db.collection(base+'/accountingEntries').where('sourceId','==',id).limit(MAX+1));need(snapshot.docs.length<=MAX);
  const adjustments=snapshot.docs.map(x=>{const row=x.data();need(row.key===x.id);return row;}).filter(x=>x.source==='purchase'&&x.key!==original.key);
  if(extraAdjustment?.sourceId===id&&!adjustments.some(x=>x.key===extraAdjustment.key))adjustments.push(extraAdjustment);
  result.push({purchase,original,adjustments,payments:payload.supplierPayments});
 }
 return result;
}
async function projection(db,tx,s,payload,posted,approval,through,extraAdjustment){
 const approvals=[...posted.map(x=>x.approval),...(approval?[approval]:[])];
 if(!approvals.length)return {balances:[],journals:[]};
 const sources=await loadSources(db,tx,s,payload,approvals,extraAdjustment);
 const args={scope:s,sources,settlements:approvals,treasuryEntries:payload.treasuryEntries,treasuryAccounts:payload.treasuryAccounts};
 const full=projectSupplierCommercialSettlements({...args,through:'9999-12-31'});
 for(const old of posted)need(equal(old.journal,full.journals.find(j=>j.id===old.approval.id)),'FISCAL_SETTLEMENT_POSTING_CONFLICT');
 return through==='9999-12-31'?full:projectSupplierCommercialSettlements({...args,through});
}
async function allProjections(db,tx,s,payload,posted,approval,through,extraAdjustment){
 const groups=new Set([...posted.map(x=>x.egsId),...(approval?[approval.egsId]:[])]),balances=[],journals=[];
 for(const egsId of groups){const p=await projection(db,tx,{...s,egsId},payload,posted.filter(x=>x.egsId===egsId),approval?.egsId===egsId?approval:null,through,extraAdjustment);balances.push(...p.balances);journals.push(...p.journals);}
 return {balances,journals:journals.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))};
}
// Called inside the same transaction that will record the journal and claims.
// Only server-approved immutable evidence may authorize a refund or offset.
export async function postSupplierSettlement(db,tx,s,source,id,today){
 need(typeof id==='string'&&ID.test(id)&&day(today));
 const base=simulationBase(s),approval=data(await tx.get(db.doc(base+'/supplierSettlementReviews/'+id)));
 need(same(approval,s)&&approval.id===id&&approval.state==='approved'&&HEX.test(approval.evidenceDigest)&&day(approval.date)&&approval.date<=today);
 const proof=data(await tx.get(db.doc(base+'/supplierSettlementEvidence/'+approval.evidenceDigest)));
 const {evidenceDigest,...facts}=approval;
 need(same(proof,s)&&proof.state==='verified'&&proof.digest===evidenceDigest&&equal(proof.settlement,facts)&&typeof proof.bytes==='string'&&proof.bytes.length<=700000);
 const bytes=Buffer.from(proof.bytes,'base64');need(bytes.length>0&&bytes.toString('base64')===proof.bytes&&hash(bytes)===evidenceDigest);
 const posted=await loadPosted(db,tx,s),prior=posted.find(x=>x.approval.id===id),key='supplier-settlement-'+id;
 if(prior){need(equal(prior.approval,approval));await allProjections(db,tx,s,source.payload,posted,null,'9999-12-31');return {status:'posted',key};}
 need(posted.length<MAX&&(!source.closedThrough||approval.date>source.closedThrough),'FISCAL_PERIOD_CLOSED');
 const evidenceRef=evidenceClaim(db,s,evidenceDigest);need(!(await tx.get(evidenceRef)).exists,'FISCAL_SETTLEMENT_EVIDENCE_DUPLICATE');
 let cashRef;
 if(approval.kind==='adjusted-payment-reversal')need(posted.some(x=>x.approval.id===approval.reversesSettlementId&&x.approval.kind==='adjusted-payment'),'FISCAL_SETTLEMENT_REVERSAL_REQUIRED');
 if(['refund','adjusted-payment','adjusted-payment-reversal'].includes(approval.kind)){
  need(ID.test(approval.treasuryEntryId));cashRef=settlementCashClaim(db,s,approval.treasuryEntryId);
  need(!(await tx.get(cashRef)).exists&&!(await tx.get(accountRef(db,s,'advanceTreasuryReservations',approval.treasuryEntryId))).exists&&!(await tx.get(accountRef(db,s,'advanceTreasuryIndex',approval.treasuryEntryId))).exists,'FISCAL_ADVANCE_CASH_ALREADY_CLAIMED');
 }
 const full=await allProjections(db,tx,s,source.payload,posted,approval,'9999-12-31'),journal=full.journals.find(j=>j.id===id);
 need(journal&&journal.lines.length===2&&journal.lines[0].side==='debit'&&journal.lines[1].side==='credit'&&journal.lines.every(l=>l.amount===approval.amount));
 // A newly approved backdated withdrawal must not create a current credit.
 if(approval.kind==='adjusted-payment'){
  const current=await allProjections(db,tx,s,source.payload,posted,approval,today);
  need(current.balances.find(x=>x.purchaseId===approval.sourcePurchaseId)?.supplierCredit==='0.00','FISCAL_SETTLEMENT_REVIEW_REQUIRED');
 }
 tx.create(db.doc(base+'/supplierSettlementPostings/'+id),{...s,key,approval,journal});
 tx.create(evidenceRef,{...s,key,digest:reviewDigest(approval)});
 if(cashRef)tx.create(cashRef,{...s,key,cashDigest:approval.cashDigest});
 return {status:'posted',key};
}
// Output-only voucher facts, exclusively from the already validated AP/cash replay.
function adjustedPaymentVouchers(posted,result,payload,from,to){
 const applied=new Set(result.journals.map(j=>j.id)),out=[];
 for(const {approval:a} of posted){
  if(a.kind!=='adjusted-payment'||a.date<from||a.date>to)continue;
  need(applied.has(a.id),'FISCAL_SETTLEMENT_POSTING_CONFLICT');
  const cash=payload.treasuryEntries.filter(e=>e.id===a.treasuryEntryId);
  need(cash.length===1&&cash[0].type==='withdrawal'&&cash[0].amount===a.amount&&reviewDigest(supplierRefundCashFacts(cash[0]))===a.cashDigest,'FISCAL_SETTLEMENT_POSTING_CONFLICT');
  const accounts=payload.treasuryAccounts.filter(e=>e.id===cash[0].fromAccountId);
  need(accounts.length===1&&['cash','bank'].includes(accounts[0].kind),'FISCAL_SETTLEMENT_POSTING_CONFLICT');
  const reversed=posted.map(x=>x.approval).filter(r=>r.kind==='adjusted-payment-reversal'&&r.reversesSettlementId===a.id&&r.date<=to);
  need(reversed.length<=1&&reversed.every(r=>applied.has(r.id)&&r.amount===a.amount&&r.sourcePurchaseId===a.sourcePurchaseId),'FISCAL_SETTLEMENT_POSTING_CONFLICT');
  const r=reversed[0];
  out.push({id:a.id,purchaseId:a.sourcePurchaseId,workspaceId:a.workspaceId,branchId:a.branchId,supplierId:a.supplierId,currency:a.currency,date:a.date,amount:a.amount,treasuryEntryId:a.treasuryEntryId,accountKind:accounts[0].kind,reversalId:r?.id??null,reversalDate:r?.date??null});
 }
 return out.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}
export async function readSupplierSettlements(db,tx,s,payload,from,to){
 const posted=await loadPosted(db,tx,s),result=await allProjections(db,tx,s,payload,posted,null,to);
 const rows=await collectionRows(db,tx,simulationBase(s)+'/supplierSettlementReviews'),ids=new Set(posted.map(x=>x.approval.id)),pending=[];
 for(const {id,row} of rows){
  if(row.state!=='approved')continue;
  need(ID.test(id)&&row.id===id&&sameWorkspace(row,s)&&day(row.date)&&['refund','offset','adjusted-payment','adjusted-payment-reversal'].includes(row.kind));
  if(!ids.has(id)&&row.date<=to)pending.push({id,date:row.date,kind:row.kind,selectedIssuer:row.egsId===s.egsId});
 }
 return {balances:result.balances,journals:result.journals.filter(j=>j.date>=from),vouchers:adjustedPaymentVouchers(posted,result,payload,from,to),pending:pending.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))};
}
export async function assertSupplierSettlementContinuity(db,tx,s,payload,extraAdjustment){
 const posted=await loadPosted(db,tx,s);
 if(posted.length)await allProjections(db,tx,s,payload,posted,null,'9999-12-31',extraAdjustment);
}
// Compare the actual post-offset payable both before and after a new wallet
// publication. A backdated payment can be valid on its stated date yet
// consume credit already applied by an offset, or create a fresh current
// supplier credit. Subsequent approved tax adjustments are not cash mutations.
export async function assertPostedSupplierPaymentTransition(db,tx,s,before,candidate,today){
 need(day(today));
 const posted=await loadPosted(db,tx,s);
 if(!posted.length)return;
 const previous=await allProjections(db,tx,s,before,posted,null,today);
 await allProjections(db,tx,s,candidate,posted,null,'9999-12-31');
 const next=await allProjections(db,tx,s,candidate,posted,null,today);
 const map=new Map(previous.balances.map(b=>[b.purchaseId,b]));
 const cents=v=>{need(typeof v==='string'&&/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(v));return BigInt(v.replace('.',''));};
 for(const b of next.balances){
  const old=map.get(b.purchaseId);
  need(old&&old.supplierId===b.supplierId&&old.currency===b.currency,'FISCAL_SETTLEMENT_POSTING_CONFLICT');
  need(cents(b.paid)<=cents(old.paid)||cents(b.supplierCredit)===0n,'FISCAL_SETTLEMENT_REVIEW_REQUIRED');
 }
}
// Bring the authoritative settlement projection into the existing purchase
// reconciliation, without pretending that the commercial AP journal has
// already been migrated. A mismatch must remain visible and prevent closure.
export function mergeSupplierSettlementReconciliation(reconciliation,balance){
 const cents=v=>{need(typeof v==='string'&&/^-?(?:0|[1-9]\d{0,17})\.\d{2}$/.test(v));return BigInt(v.replace('.',''));};
 const fmt=n=>(n<0n?'-':'')+String((n<0n?-n:n)/100n)+'.'+String((n<0n?-n:n)%100n).padStart(2,'0');
 need(reconciliation.adjustedPayable===balance.adjustedPayable&&reconciliation.paid===balance.paid,'FISCAL_SETTLEMENT_POSTING_CONFLICT');
 const delta=cents(balance.settlementDelta),out=cents(reconciliation.adjustedOutstanding)+delta,remaining=cents(balance.outstanding),credit=cents(balance.supplierCredit);
 need(remaining>=0n&&credit>=0n&&(remaining===0n||credit===0n)&&remaining-credit===out,'FISCAL_SETTLEMENT_POSTING_CONFLICT');
 return {...reconciliation,settlementDelta:fmt(delta),settledOutstanding:fmt(remaining),settledSupplierCredit:fmt(credit),matched:reconciliation.matched&&delta===0n};
}
export async function assertSettlementCashContinuity(db,tx,s,before,candidate){
 const previous=(before.treasuryEntries??[]).filter(e=>e.workspaceId===s.workspaceId),next=(candidate.treasuryEntries??[]).filter(e=>e.workspaceId===s.workspaceId);
 const map=new Map(next.map(e=>[e.id,e]));need(map.size===next.length);
 const changed=previous.filter(e=>!map.has(e.id)||!equal(supplierRefundCashFacts(e),supplierRefundCashFacts(map.get(e.id))));
 need(changed.length<=100,'FISCAL_CHANGE_LIMIT');
 for(const e of changed){need(ID.test(e.id));const claim=await tx.get(settlementCashClaim(db,s,e.id));need(!claim.exists,'FISCAL_SETTLEMENT_CASH_LOCKED');}
}
