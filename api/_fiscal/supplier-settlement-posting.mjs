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
  if(row.approval.kind==='refund'){
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
 if(approval.kind==='refund'){
  need(ID.test(approval.treasuryEntryId));cashRef=settlementCashClaim(db,s,approval.treasuryEntryId);
  need(!(await tx.get(cashRef)).exists&&!(await tx.get(accountRef(db,s,'advanceTreasuryReservations',approval.treasuryEntryId))).exists&&!(await tx.get(accountRef(db,s,'advanceTreasuryIndex',approval.treasuryEntryId))).exists,'FISCAL_ADVANCE_CASH_ALREADY_CLAIMED');
 }
 const full=await allProjections(db,tx,s,source.payload,posted,approval,'9999-12-31'),journal=full.journals.find(j=>j.id===id);
 need(journal&&journal.lines.length===2&&journal.lines[0].side==='debit'&&journal.lines[1].side==='credit'&&journal.lines.every(l=>l.amount===approval.amount));
 tx.create(db.doc(base+'/supplierSettlementPostings/'+id),{...s,key,approval,journal});
 tx.create(evidenceRef,{...s,key,digest:reviewDigest(approval)});
 if(cashRef)tx.create(cashRef,{...s,key,cashDigest:approval.cashDigest});
 return {status:'posted',key};
}
export async function readSupplierSettlements(db,tx,s,payload,from,to){
 const posted=await loadPosted(db,tx,s),result=await allProjections(db,tx,s,payload,posted,null,to);
 const rows=await collectionRows(db,tx,simulationBase(s)+'/supplierSettlementReviews'),ids=new Set(posted.map(x=>x.approval.id)),pending=[];
 for(const {id,row} of rows){
  if(row.state!=='approved')continue;
  need(ID.test(id)&&row.id===id&&sameWorkspace(row,s)&&day(row.date)&&['refund','offset'].includes(row.kind));
  if(!ids.has(id)&&row.date<=to)pending.push({id,date:row.date,kind:row.kind,selectedIssuer:row.egsId===s.egsId});
 }
 return {balances:result.balances,journals:result.journals.filter(j=>j.date>=from),pending:pending.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))};
}
export async function assertSupplierSettlementContinuity(db,tx,s,payload,extraAdjustment){
 const posted=await loadPosted(db,tx,s);
 if(posted.length)await allProjections(db,tx,s,payload,posted,null,'9999-12-31',extraAdjustment);
}
export async function assertSettlementCashContinuity(db,tx,s,before,candidate){
 const previous=(before.treasuryEntries??[]).filter(e=>e.workspaceId===s.workspaceId),next=(candidate.treasuryEntries??[]).filter(e=>e.workspaceId===s.workspaceId);
 const map=new Map(next.map(e=>[e.id,e]));need(map.size===next.length);
 const changed=previous.filter(e=>!map.has(e.id)||!equal(supplierRefundCashFacts(e),supplierRefundCashFacts(map.get(e.id))));
 need(changed.length<=100,'FISCAL_CHANGE_LIMIT');
 for(const e of changed){need(ID.test(e.id));const claim=await tx.get(settlementCashClaim(db,s,e.id));need(!claim.exists,'FISCAL_SETTLEMENT_CASH_LOCKED');}
}
