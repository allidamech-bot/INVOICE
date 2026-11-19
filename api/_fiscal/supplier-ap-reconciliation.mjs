import {supplierSettlementTimeline} from './settlement-integrity.mjs';
const need=ok=>{if(!ok)throw Error('FISCAL_AP_GL_RECONCILIATION_REQUIRED');};
const cents=v=>{need(typeof v==='string'&&/^-?(?:0|[1-9][0-9]{0,17})\.\d{2}$/.test(v));return BigInt(v.replace('.',''));};
const money=n=>(n<0n?'-':'')+String((n<0n?-n:n)/100n)+'.'+String((n<0n?-n:n)%100n).padStart(2,'0');
const day=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const same=(a,b)=>a.workspaceId===b.workspaceId&&a.branchId===b.branchId&&a.currency===b.currency;
// Replay the existing AP journals and real supplier cash; never manufacture
// payment records or post a second treasury movement.
export function projectSupplierAPJournal({purchase,original,adjustments,payments,settledBalance,settlementJournals,through,legacyPayable}){
 need(day(through)&&day(purchase.date)&&purchase.date<=through&&purchase.status==='posted'&&purchase.supplierSnapshot?.sourceSupplierId&&original.sourceId===purchase.id&&original.workspaceId===purchase.workspaceId&&original.currency===purchase.currency&&original.amount.kind==='invoice'&&original.amount.treatment==='domestic'&&cents(legacyPayable)===cents(original.amount.gross));
 const rows=[],seen=new Set();
 const add=(id,date,type,reference,net)=>{
   need(typeof id==='string'&&id&&!seen.has(id)&&day(date)&&date<=through&&net!==0n);
   seen.add(id);rows.push({id,date,type,reference,credit:money(net>0n?net:0n),debit:money(net<0n?-net:0n)});
 };
 const fiscal=(j,date,type)=>{
   need(j.sourceId===purchase.id&&j.workspaceId===purchase.workspaceId&&j.currency===purchase.currency&&j.amount.treatment==='domestic'&&Array.isArray(j.amount.lines));
   let debit=0n,credit=0n,ap=0n;for(const l of j.amount.lines){const n=cents(l.amount);need(n>0n&&['debit','credit'].includes(l.side));if(l.side==='debit')debit+=n;else credit+=n;if(l.account==='accounts-payable')ap+=l.side==='credit'?n:-n;}
   const expected=cents(j.amount.gross)*(j.amount.kind==='credit-note'?-1n:1n);need(debit===credit&&debit>0n&&ap===expected);
   add(j.key,date,type,j.documentNumber||purchase.number,ap);
 };
 fiscal(original,purchase.date,'purchase');
 for(const j of adjustments){if(j.taxDate>through||j.amount.treatment!=='domestic')continue;need(['credit-note','debit-note'].includes(j.amount.kind));fiscal(j,j.taxDate,j.amount.kind==='credit-note'?'supplier-credit':'supplier-debit');}
 for(const p of payments.filter(p=>p.purchaseId===purchase.id)){
   need(same(p,purchase)&&p.supplierId===purchase.supplierSnapshot.sourceSupplierId&&p.purchaseNumber===purchase.number&&day(p.date)&&p.date>=purchase.date&&cents(p.amount)>0n);
   if(p.date<=through)add('payment:'+p.id,p.date,'payment',p.reference||p.id,-cents(p.amount));
   if(p.voidedAt){const d=p.voidedAt.slice(0,10);need(day(d)&&d>=p.date);if(d<=through)add('void:'+p.id,d,'payment-void',p.reference||p.id,cents(p.amount));}
 }
 let delta=0n;
 for(const j of settlementJournals){
   if(j.date>through)continue;const lines=j.lines.filter(x=>x.account==='accounts-payable'&&x.purchaseId===purchase.id);if(!lines.length)continue;
   need(['refund','offset'].includes(j.kind)&&lines.length===1&&j.lines.length===2&&j.lines[0].side==='debit'&&j.lines[1].side==='credit'&&j.lines[0].amount===j.lines[1].amount&&cents(lines[0].amount)>0n);
   const n=cents(lines[0].amount)*(lines[0].side==='credit'?1n:-1n);delta+=n;
   add('settlement:'+j.id,j.date,j.kind==='refund'?'supplier-refund':'supplier-offset',j.id,n);
 }
 const timeline=supplierSettlementTimeline({purchase,original,adjustments,payments,through});
 const expected=cents(timeline.adjustedOutstanding)+delta;
 if(settledBalance)need(settledBalance.purchaseId===purchase.id&&settledBalance.adjustedPayable===timeline.adjustedPayable&&settledBalance.paid===timeline.paid&&cents(settledBalance.settlementDelta)===delta&&cents(settledBalance.outstanding)-cents(settledBalance.supplierCredit)===expected);
 else need(delta===0n);
 rows.sort((a,b)=>a.date.localeCompare(b.date)||Number(b.type==='purchase')-Number(a.type==='purchase')||a.id.localeCompare(b.id));
 const actual=rows.reduce((sum,x)=>sum+cents(x.credit)-cents(x.debit),0n);need(actual===expected);
 return {purchaseId:purchase.id,number:purchase.number,workspaceId:purchase.workspaceId,branchId:purchase.branchId,supplierId:purchase.supplierSnapshot.sourceSupplierId,currency:purchase.currency,through,originalPayable:legacyPayable,adjustedPayable:timeline.adjustedPayable,paid:timeline.paid,settlementDelta:money(delta),outstanding:money(actual>0n?actual:0n),supplierCredit:money(actual<0n?-actual:0n),entries:rows};
}
