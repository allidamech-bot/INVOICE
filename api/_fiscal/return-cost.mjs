import {stockCostCents} from './fiscal-cost.mjs';
const need=ok=>{if(!ok)throw Error('FISCAL_RETURN_COST_INVALID');};
const qty=v=>{need(typeof v==='string'&&/^\d+(?:\.\d{1,4})?$/.test(v)&&v.length<=30);const [a,b='']=v.split('.');return BigInt(a+b.padEnd(4,'0'));};
const qstr=q=>String(q/10000n)+'.'+String(q%10000n).padStart(4,'0');
const money=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const scope=(a,b)=>a.workspaceId===b.workspaceId&&a.branchId===b.branchId&&a.currency===b.currency;
// Called after domain physical-return integrity validation and fiscal source verification.
// Cumulative rounding telescopes against the original issue, so partial receipts
// cannot reverse more COGS than the sale. A correction is a new dated journal.
export function returnCostJournal({documents,movements,through}){
 need(day(through));const docs=new Map(),byId=new Map(),rows=[];
 for(const d of documents){need(d.id&&!docs.has(d.id));docs.set(d.id,d);}
 for(const m of movements){need(m.id&&!byId.has(m.id));byId.set(m.id,m);}
 const events=movements.filter(m=>m.salesReturn||m.salesReturnCorrection||m.id.startsWith('sales-credit-stock:')||m.id.startsWith('sales-credit-stock-correction:'));
 for(const m of events){need(day(m.date)&&Boolean(m.salesReturn)!==Boolean(m.salesReturnCorrection));}
 events.sort((a,b)=>a.date.localeCompare(b.date)||Number(!!a.salesReturnCorrection)-Number(!!b.salesReturnCorrection)||a.id.localeCompare(b.id));
 const active=new Map(),balances=new Map();
 for(const m of events){if(m.date>through)continue;
  const reversing=!!m.salesReturnCorrection,receipt=reversing?byId.get(m.salesReturnCorrection.receiptMovementId):m,proof=receipt?.salesReturn;
  need(proof&&receipt.date<=m.date&&scope(m,receipt)&&m.type==='adjustment'&&m.itemId===receipt.itemId&&m.unitCost===receipt.unitCost);
  const invoice=docs.get(proof.invoiceId),credit=docs.get(proof.creditNoteId),issue=byId.get('sales-invoice-stock:'+proof.invoiceId+':'+proof.invoiceLineId);
  need(invoice&&credit&&invoice.status==='final'&&credit.status==='final'&&credit.role==='credit-note'&&credit.creditForId===invoice.id&&scope(invoice,credit)&&scope(invoice,issue??{})&&scope(issue,receipt)&&issue.type==='issue'&&issue.sourceId===invoice.id&&issue.itemId===receipt.itemId&&issue.unitCost===receipt.unitCost&&day(credit.issueDate)&&receipt.date>=credit.issueDate&&typeof issue.quantity==='string'&&issue.quantity.startsWith('-'));
  const q=qty(receipt.quantity),maximum=qty(issue.quantity.slice(1));need(q>0n&&maximum>0n);
  if(reversing){need(active.get(receipt.id)===true&&m.quantity.startsWith('-')&&qty(m.quantity.slice(1))===q);active.set(receipt.id,false);}else{need(!active.has(receipt.id));active.set(receipt.id,true);}
  const old=balances.get(issue.id)??0n,next=old+(reversing?-q:q);need(next>=0n&&next<=maximum);balances.set(issue.id,next);
  const total=x=>x===0n?0n:stockCostCents(qstr(x),issue.unitCost),delta=total(next)-total(old),amount=money(delta<0n?-delta:delta);
  rows.push({movementId:m.id,invoiceId:invoice.id,creditNoteId:credit.id,date:m.date,amount,kind:reversing?'return-correction':'return-receipt',lines:delta===0n?[]:[{account:'inventory',side:delta>0n?'debit':'credit',amount},{account:'cost-of-sales',side:delta>0n?'credit':'debit',amount}]});
 }
 return rows;
}
