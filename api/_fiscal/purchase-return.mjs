import {stockCostCents} from './fiscal-cost.mjs';
const need=ok=>{if(!ok)throw Error('FISCAL_PURCHASE_RETURN_INVALID');};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const q=v=>{need(typeof v==='string'&&/^\d+(?:\.\d{1,4})?$/.test(v)&&v.length<=30);const [a,b='']=v.split('.');return BigInt(a+b.padEnd(4,'0'));};
const fixed=n=>String(n/10000n)+'.'+String(n%10000n).padStart(4,'0');
const money=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
const cents=v=>{need(typeof v==='string'&&/^\d{1,18}\.\d{2}$/.test(v));return BigInt(v.replace('.',''));};
export const isFiscalPurchaseReturn=m=>typeof m.id==='string'&&m.id.startsWith('fiscal-purchase-return:');
// Restricted physical dispatch: no mixed receipts, sales or transfers. The tax
// credit's cost entry must equal the exact incremental cost of dispatched goods.
// Discounts, additional charges and recoverable-VAT inventory require review.
export function planPurchaseReturn({purchase,original,credit,lines,movements,warehouseId,date,adjustmentId,priorMovementIds=[]}){
 need(id(adjustmentId)&&id(purchase.id)&&id(purchase.workspaceId)&&id(purchase.branchId)&&id(warehouseId)&&day(date)&&day(purchase.date)&&date>=purchase.date&&purchase.status==='posted'&&purchase.currency==='SAR');
 need(original.kind==='invoice'&&credit.kind==='credit-note'&&original.treatment==='domestic'&&credit.treatment==='domestic'&&cents(original.deductibleVat)===0n&&cents(credit.deductibleVat)===0n&&Array.isArray(lines)&&lines.length>0&&lines.length<=200);
 const eligible=new Map(purchase.items.map(l=>[l.id,l])),used=new Set(),items=new Set(),prior=new Set(priorMovementIds),result=[];let total=0n;
 need(eligible.size===purchase.items.length&&prior.size===priorMovementIds.length);
 for(const row of lines){
  need(row&&id(row.lineId)&&!used.has(row.lineId));used.add(row.lineId);const line=eligible.get(row.lineId);need(line&&id(line.savedItemId)&&!items.has(line.savedItemId)&&purchase.items.filter(x=>x.savedItemId===line.savedItemId).length===1);items.add(line.savedItemId);
  const received=q(line.quantity),requested=q(row.quantity),cost=line.landedUnitCost||line.unitCost;need(received>0n&&requested>0n);
  const related=movements.filter(m=>m.itemId===line.savedItemId),receipts=related.filter(m=>m.type==='purchase'&&m.sourceId===purchase.id);need(receipts.length===1);const receipt=receipts[0];
  need(receipt.workspaceId===purchase.workspaceId&&receipt.branchId===purchase.branchId&&receipt.currency==='SAR'&&receipt.sku===line.sku&&receipt.date===purchase.date&&q(receipt.quantity)===received&&receipt.unitCost===cost&&(receipt.toWarehouseId||'warehouse-'+purchase.branchId)===warehouseId);
  let returned=0n;for(const m of related){if(m.id===receipt.id)continue;need(prior.has(m.id)&&isFiscalPurchaseReturn(m)&&m.type==='purchase-reversal'&&m.sourceId===purchase.id&&m.workspaceId===purchase.workspaceId&&m.branchId===purchase.branchId&&m.currency==='SAR'&&m.unitCost===cost&&m.fromWarehouseId===warehouseId&&m.date<=date&&typeof m.quantity==='string'&&m.quantity.startsWith('-'));returned+=q(m.quantity.slice(1));}
  need(returned+requested<=received);const cumulative=n=>n?stockCostCents(fixed(n),cost):0n;const value=cumulative(returned+requested)-cumulative(returned);total+=value;
  const movementId='fiscal-purchase-return:'+adjustmentId+':'+line.id;need(!movements.some(m=>m.id===movementId));
  result.push({id:movementId,itemId:line.savedItemId,itemNameEn:line.descriptionEn,itemNameAr:line.descriptionAr,sku:line.sku,date,type:'purchase-reversal',quantity:'-'+fixed(requested),unitCost:cost,currency:'SAR',sourceId:purchase.id,sourceNumber:purchase.number,note:'Verified supplier return '+adjustmentId,fromWarehouseId:warehouseId,workspaceId:purchase.workspaceId,branchId:purchase.branchId});
 }
 need(cents(credit.net)+cents(credit.vat)===cents(credit.gross)&&total===cents(credit.gross));
 return {stockCost:money(total),movements:result};
}
