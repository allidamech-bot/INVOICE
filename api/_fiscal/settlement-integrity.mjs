import {supplierAdjustmentProjection} from './fiscal-cost.mjs';
const need=ok=>{if(!ok)throw Error('FISCAL_SETTLEMENT_REVIEW_REQUIRED');};
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const cents=v=>{need(typeof v==='string'&&/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(v));return BigInt(v.replace('.',''));};
const signed=v=>v.startsWith('-')?-cents(v.slice(1)):cents(v);
const fmt=n=>(n<0n?'-':'')+String((n<0n?-n:n)/100n)+'.'+String((n<0n?-n:n)%100n).padStart(2,'0');
// A credit issued after a legitimate payment may create a supplier credit.
// It does not invalidate the original payment, nor authorize another payment.
export function supplierSettlementTimeline({purchase,original,adjustments,payments,through}){
 need(day(through)&&day(purchase.date)&&day(original.taxDate)&&original.sourceId===purchase.id&&original.currency===purchase.currency&&original.workspaceId===purchase.workspaceId&&purchase.status==='posted'&&purchase.supplierSnapshot?.sourceSupplierId);
 const effective=adjustments.filter(a=>{need(day(a.taxDate));return a.taxDate<=through;});
 supplierAdjustmentProjection(original,effective,'0.00');
 const events=[],seen=new Set();
 for(const p of payments){if(p.purchaseId!==purchase.id)continue;
  need(p.id&&!seen.has(p.id)&&p.workspaceId===purchase.workspaceId&&p.branchId===purchase.branchId&&p.currency===purchase.currency&&p.supplierId===purchase.supplierSnapshot.sourceSupplierId&&p.purchaseNumber===purchase.number&&day(p.date)&&p.date>=purchase.date&&cents(p.amount)>0n);seen.add(p.id);
  const voidDate=p.voidedAt?String(p.voidedAt).slice(0,10):null;need(!voidDate||day(voidDate)&&voidDate>=p.date);
  if(p.date<=through)events.push({date:p.date,id:p.id,delta:cents(p.amount),kind:'payment'});
  if(voidDate&&voidDate<=through)events.push({date:voidDate,id:p.id,delta:-cents(p.amount),kind:'void'});
 }
 // Within a single day there is no trusted time of tax recognition in this
 // model. Apply all tax changes and voids before new settlements for that day.
 const dates=[...new Set(events.map(e=>e.date))].sort();let paid=0n;const violations=[];
 for(const date of dates){const today=events.filter(x=>x.date===date);const liability=signed(supplierAdjustmentProjection(original,effective.filter(a=>a.taxDate<=date),'0.00').adjustedPayable);
  for(const e of today.filter(x=>x.kind==='void'&&events.some(p=>p.id===x.id&&p.kind==='payment'&&p.date<date)))paid+=e.delta;
  const cancelled=new Set(today.filter(x=>x.kind==='void').map(x=>x.id));
  for(const e of today.filter(x=>x.kind==='payment'&&!cancelled.has(x.id)).sort((a,b)=>a.id.localeCompare(b.id))){paid+=e.delta;if(paid>liability)violations.push(e.id);}
  need(paid>=0n);
 }
 return {...supplierAdjustmentProjection(original,effective,fmt(paid)),paid:fmt(paid),violations};
}
// The existing commercial document schema can represent an additional monetary
// debit as a new receivable only if no physical quantity is issued. Prepayments
// and advance allocation require explicit representations, not normal sales.
export function commercialFiscalPostingPolicy(document,model,scenario){
 if(!scenario&&model.kind!=='prepayment'&&model.kind!=='debit-note')return 'ordinary';
 if(scenario?.kind==='debit-note'&&model.kind==='debit-note'&&document.currency==='SAR'&&document.role==='standard'&&Array.isArray(document.items)&&document.items.length>0&&document.items.every(l=>l.stockTreatment==='non-stock'))return 'debit-service';
 return 'private-only';
}
// A newer publication cannot use a backdated payment to bypass a credit that
// is already known by the trusted server. Existing excess from a later credit
// may remain, but new payment mutations must never increase it.
export function assertSupplierSettlementTransition({purchase,original,adjustments,beforePayments,afterPayments,today}){
 need(day(today));
 const afterById=new Map(afterPayments.filter(p=>p.purchaseId===purchase.id).map(p=>[p.id,p]));
 for(const old of beforePayments.filter(p=>p.purchaseId===purchase.id)){
   const next=afterById.get(old.id);need(next);
   for(const key of ['id','purchaseId','purchaseNumber','supplierId','workspaceId','branchId','currency','amount','date','method','reference','notes','createdAt'])need(next[key]===old[key]);
   if(old.voidedAt)need(next.voidedAt===old.voidedAt&&next.voidReason===old.voidReason);
   else if(next.voidedAt)need(day(next.voidedAt.slice(0,10))&&next.voidedAt.slice(0,10)===today&&typeof next.voidReason==='string'&&next.voidReason.trim());
 }
 const previous=supplierSettlementTimeline({purchase,original,adjustments,payments:beforePayments,through:'9999-12-31'}),next=supplierSettlementTimeline({purchase,original,adjustments,payments:afterPayments,through:'9999-12-31'});
 const priorBad=new Set(previous.violations);need(next.violations.every(x=>priorBad.has(x)));
 const old=supplierSettlementTimeline({purchase,original,adjustments,payments:beforePayments,through:today}),current=supplierSettlementTimeline({purchase,original,adjustments,payments:afterPayments,through:today});
 need(cents(current.paid)<=cents(old.paid)||signed(current.adjustedOutstanding)>=0n);
 return current;
}
