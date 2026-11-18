import {stockCostCents} from './fiscal-cost.mjs';
const need=ok=>{if(!ok)throw Error('FISCAL_COST_ALLOCATION_INVALID');};
const cents=v=>{need(typeof v==='string'&&/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(v));return BigInt(v.replace('.',''));};
const fmt=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
const scoped=(a,b)=>a.workspaceId===b.workspaceId&&a.branchId===b.branchId;
const qty=v=>{need(typeof v==='string'&&/^\d+(?:\.\d{1,4})?$/.test(v)&&v.length<=30);const [a,b='']=v.split('.');return BigInt(a+b.padEnd(4,'0'));};
// Deliberately narrow: the original inbound receipt is the only movement for
// each affected SKU. Mixed or consumed stock needs a separately approved
// inventory/COGS allocation. No historical stock or supplier row is mutated.
export function planPurchaseCostCorrection({purchase,amount,allocations,movements,savedItems}){
 need(purchase.status==='posted'&&purchase.currency==='SAR'&&amount.kind==='invoice'&&amount.treatment==='domestic'&&Array.isArray(allocations)&&Array.isArray(purchase.items)&&purchase.items.length>0&&purchase.items.length<=200&&allocations.length===purchase.items.length);
 const gross=cents(amount.gross),vat=cents(amount.vat),deductible=cents(amount.deductibleVat);need(cents(amount.net)+vat===gross&&deductible>0n&&deductible<=vat);
 const indexed=new Map(),ids=new Set(),skuIds=new Set(),lines=[],updates=[];
 for(const allocation of allocations){need(allocation&&typeof allocation.lineId==='string'&&allocation.lineId&&!indexed.has(allocation.lineId)&&typeof allocation.adjustedUnitCost==='string');indexed.set(allocation.lineId,allocation);}
 let total=0n,allocated=0n,corrected=0n;
 for(const line of purchase.items){
  need(typeof line.id==='string'&&line.id&&!ids.has(line.id));ids.add(line.id);
  const a=indexed.get(line.id);need(a);const q=qty(line.quantity),oldCost=line.landedUnitCost||line.unitCost,old=stockCostCents(line.quantity,oldCost),tax=cents(a.deductibleVat),next=stockCostCents(line.quantity,a.adjustedUnitCost);
  need(q>0n&&tax<=old&&next===old-tax);total+=old;allocated+=tax;corrected+=next;
  let movementId=null;
  if(line.savedItemId){
   need(!skuIds.has(line.savedItemId));skuIds.add(line.savedItemId);
   const related=movements.filter(m=>m.itemId===line.savedItemId);
   need(related.length===1);const m=related[0];need(m.id&&scoped(m,purchase)&&m.currency===purchase.currency&&m.type==='purchase'&&m.sourceId===purchase.id&&m.date===purchase.date&&qty(m.quantity)===q&&m.unitCost===oldCost&&m.sku===line.sku);
   const candidates=savedItems.filter(x=>x.id===line.savedItemId);need(candidates.length===1);const item=candidates[0];need(scoped(item,purchase)&&!item.archived&&item.inventoryTracking!=='non-stock'&&item.sku===line.sku&&item.unit===line.unit&&item.lastUnitCost===oldCost&&item.lastCostCurrency===purchase.currency);
   movementId=m.id;updates.push({itemId:item.id,previousUnitCost:oldCost,correctedUnitCost:a.adjustedUnitCost});
  }
  lines.push({lineId:line.id,itemId:line.savedItemId||null,movementId,originalAmount:fmt(old),deductibleVat:fmt(tax),correctedAmount:fmt(next),correctedUnitCost:a.adjustedUnitCost});
 }
 need(total===gross&&allocated===deductible&&corrected===gross-deductible);
 return {grossPayable:fmt(gross),deductibleVat:fmt(deductible),correctedCost:fmt(corrected),lines,updates};
}
