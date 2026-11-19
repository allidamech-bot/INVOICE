import {supplierSettlementTimeline} from './settlement-integrity.mjs';
import {reviewDigest} from './commercial-source.js';

const need=ok=>{if(!ok)throw Error('FISCAL_SUPPLIER_SETTLEMENT_REVIEW_REQUIRED');};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const cents=x=>{need(typeof x==='string'&&/^-?(?:0|[1-9]\d{0,17})\.\d{2}$/.test(x));return BigInt(x.replace('.',''));};
const money=x=>(x<0n?'-':'')+(x<0n?-x:x)/100n+'.'+String((x<0n?-x:x)%100n).padStart(2,'0');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const same=(a,b)=>a.workspaceId===b.workspaceId&&a.branchId===b.branchId&&a.currency===b.currency&&a.supplierSnapshot?.sourceSupplierId===b.supplierSnapshot?.sourceSupplierId;
export function supplierRefundCashFacts(e){
 return Object.fromEntries(['id','workspaceId','branchId','currency','date','amount','type','sourceType','sourceId','fromAccountId','toAccountId','reference','notes','createdAt','voidedAt'].map(k=>[k,e[k]??'']));
}
// Pure projection over immutable, independently approved settlement records.
// A cash refund requires the original recorded deposit, and an offset only
// transfers liability. Neither creates a fictitious supplier payment.
export function projectSupplierCommercialSettlements({scope,sources,settlements,treasuryEntries,treasuryAccounts,reservedCashIds=[],through}){
 need(day(through)&&scope?.environment==='simulation'&&id(scope.accountUid)&&id(scope.workspaceId)&&id(scope.egsId)&&Array.isArray(sources)&&Array.isArray(settlements)&&sources.length<=200&&settlements.length<=200);
 const byId=new Map(),delta=new Map(),events=new Map(),usedProof=new Set(),usedCash=new Set(reservedCashIds),usedIds=new Set(),journals=[],reversed=new Set();
 const event=d=>{if(!events.has(d))events.set(d,[]);return events.get(d);};
 for(const s of sources){
  const p=s.purchase,o=s.original;need(id(p?.id)&&!byId.has(p.id)&&id(p.workspaceId)&&id(p.branchId)&&id(p.supplierSnapshot?.sourceSupplierId)&&p.workspaceId===scope.workspaceId&&p.currency==='SAR'&&p.status==='posted'&&day(p.date)&&o?.accountUid===scope.accountUid&&o.workspaceId===scope.workspaceId&&o.egsId===scope.egsId&&o.environment===scope.environment&&o.sourceFingerprint===reviewDigest(p)&&o.sourceId===p.id&&o.amount?.kind==='invoice'&&Array.isArray(s.adjustments)&&Array.isArray(s.payments));
  byId.set(p.id,s);delta.set(p.id,0n);
  const all=supplierSettlementTimeline({...s,through:'9999-12-31'});need(all.violations.length===0);
  for(const a of s.adjustments){need(day(a.taxDate));event(a.taxDate);}
  for(const pay of s.payments.filter(x=>x.purchaseId===p.id)){need(day(pay.date));event(pay.date);if(pay.voidedAt)event(pay.voidedAt.slice(0,10));}
  event(p.date);
 }
 for(const r of settlements){
  need(r&&id(r.id)&&!usedIds.has(r.id)&&r.state==='approved'&&r.accountUid===scope.accountUid&&r.workspaceId===scope.workspaceId&&r.egsId===scope.egsId&&r.environment===scope.environment&&['refund','offset','adjusted-payment','adjusted-payment-reversal'].includes(r.kind)&&day(r.date)&&hex(r.evidenceDigest)&&!usedProof.has(r.evidenceDigest)&&cents(r.amount)>0n);
  usedIds.add(r.id);usedProof.add(r.evidenceDigest);
  const src=byId.get(r.sourcePurchaseId);need(src&&r.sourceFingerprint===src.original.sourceFingerprint&&r.date>=src.purchase.date&&r.supplierId===src.purchase.supplierSnapshot.sourceSupplierId&&r.branchId===src.purchase.branchId&&r.currency===src.purchase.currency);
  need(r.kind==='adjusted-payment-reversal'?id(r.reversesSettlementId):!r.reversesSettlementId);
  if(r.kind==='offset'){
   const target=byId.get(r.targetPurchaseId);need(target&&target!==src&&same(src.purchase,target.purchase)&&r.targetFingerprint===target.original.sourceFingerprint&&r.date>=target.purchase.date&&!r.treasuryEntryId&&!r.cashDigest);
  }else{
   need(!r.targetPurchaseId&&!r.targetFingerprint&&id(r.treasuryEntryId)&&hex(r.cashDigest)&&!usedCash.has(r.treasuryEntryId));
   usedCash.add(r.treasuryEntryId);
   const rows=treasuryEntries.filter(e=>e.id===r.treasuryEntryId);need(rows.length===1);const e=rows[0];
   const outbound=r.kind==='adjusted-payment',accountId=outbound?e.fromAccountId:e.toAccountId;
   need(e.type===(outbound?'withdrawal':'deposit')&&e.sourceType==='manual'&&!e.sourceId&&!e.voidedAt&&id(accountId)&&!(outbound?e.toAccountId:e.fromAccountId)&&e.date===r.date&&e.amount===r.amount&&e.workspaceId===r.workspaceId&&e.branchId===r.branchId&&e.currency===r.currency&&r.cashDigest===reviewDigest(supplierRefundCashFacts(e)));
   const acc=treasuryAccounts.filter(a=>a.id===accountId);need(acc.length===1&&acc[0].workspaceId===r.workspaceId&&acc[0].branchId===r.branchId&&acc[0].currency===r.currency);
   if(r.kind!=='refund')need(['bank','cash'].includes(acc[0].kind));
  }
  event(r.date).push(r);
 }
 const raw=(s,d)=>supplierSettlementTimeline({...s,through:d});
 const outstanding=(key,d)=>cents(raw(byId.get(key),d).adjustedOutstanding)+delta.get(key);
 // A supplier credit can arise on a later tax credit note; it is not a
 // payment error. A NEW payment, however, cannot overpay an already adjusted
 // payable (including previously received offsets).
 for(const d of [...events.keys()].sort()){
  if(d>through)break;
  for(const [key,s] of byId){
   const newCash=s.payments.some(p=>p.purchaseId===key&&p.date===d&&(!p.voidedAt||p.voidedAt.slice(0,10)>d));
   if(newCash)need(outstanding(key,d)>=0n);
  }
  for(const r of events.get(d).sort((a,b)=>Number(a.kind==='adjusted-payment-reversal')-Number(b.kind==='adjusted-payment-reversal')||a.id.localeCompare(b.id))){
   const amount=cents(r.amount),src=r.sourcePurchaseId;
   if(r.kind==='adjusted-payment'){
    const source=byId.get(src),balance=raw(source,d),legacy=cents(source.original.amount.gross)-cents(balance.paid),available=outstanding(src,d)-(legacy>0n?legacy:0n);
    need(cents(balance.debitAdjustments)>0n&&available>=amount);
    delta.set(src,delta.get(src)-amount);
    journals.push({id:r.id,date:d,kind:r.kind,treasuryEntryId:r.treasuryEntryId,lines:[{account:'accounts-payable',side:'debit',amount:r.amount,purchaseId:src},{account:'cash-bank',side:'credit',amount:r.amount}]});
    continue;
   }
   if(r.kind==='adjusted-payment-reversal'){
    const prior=settlements.find(x=>x.id===r.reversesSettlementId),posted=journals.find(x=>x.id===r.reversesSettlementId);
    need(prior?.kind==='adjusted-payment'&&posted&&prior.sourcePurchaseId===src&&prior.sourceFingerprint===r.sourceFingerprint&&prior.amount===r.amount&&prior.date<=r.date&&!reversed.has(prior.id));
    reversed.add(prior.id);delta.set(src,delta.get(src)+amount);
    journals.push({id:r.id,date:d,kind:r.kind,treasuryEntryId:r.treasuryEntryId,lines:[{account:'cash-bank',side:'debit',amount:r.amount},{account:'accounts-payable',side:'credit',amount:r.amount,purchaseId:src}]});
    continue;
   }
   need(outstanding(src,d)<=-amount);
   delta.set(src,delta.get(src)+amount);
   const credit={account:'accounts-payable',side:'credit',amount:r.amount,purchaseId:src};
   if(r.kind==='offset'){
    const dst=r.targetPurchaseId;need(outstanding(dst,d)>=amount);delta.set(dst,delta.get(dst)-amount);
    journals.push({id:r.id,date:d,kind:r.kind,lines:[{account:'accounts-payable',side:'debit',amount:r.amount,purchaseId:dst},credit]});
   }else journals.push({id:r.id,date:d,kind:r.kind,treasuryEntryId:r.treasuryEntryId,lines:[{account:'cash-bank',side:'debit',amount:r.amount},credit]});
  }
 }
 const balances=[...byId].filter(([,s])=>s.purchase.date<=through&&s.original.taxDate<=through).map(([key,s])=>{const b=raw(s,through),out=cents(b.adjustedOutstanding)+delta.get(key);return {purchaseId:key,number:s.purchase.number,supplierId:s.purchase.supplierSnapshot.sourceSupplierId,currency:s.purchase.currency,adjustedPayable:b.adjustedPayable,paid:b.paid,settlementDelta:money(delta.get(key)),outstanding:money(out>0n?out:0n),supplierCredit:money(out<0n?-out:0n)};});
 return {balances,journals};
}
