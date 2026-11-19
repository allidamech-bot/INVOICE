import {stockCostCents} from './fiscal-cost.mjs';
import {planPurchaseCostCorrection} from './purchase-cost-correction.mjs';
const need=ok=>{if(!ok)throw Error('FISCAL_LOT_ALLOCATION_REVIEW_REQUIRED');};
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const qty=v=>{need(typeof v==='string'&&/^\d+(?:\.\d{1,4})?$/.test(v)&&v.length<=30);const [a,b='']=v.split('.');return BigInt(a+b.padEnd(4,'0'));};
const cents=v=>{need(typeof v==='string'&&/^(?:0|[1-9]\d{0,17})\.\d{2}$/.test(v));return BigInt(v.replace('.',''));};
const qfmt=n=>String(n/10000n)+'.'+String(n%10000n).padStart(4,'0');
const money=n=>String(n/100n)+'.'+String(n%100n).padStart(2,'0');
const scope=(m,p)=>m.workspaceId===p.workspaceId&&m.branchId===p.branchId&&m.currency===p.currency;
const signedQty=v=>v.startsWith('-')?-qty(v.slice(1)):qty(v);
// Exact reviewed lot attribution, not an inferred FIFO/weighted average.
// Every movement of each tracked SKU is accounted for; a mixed receipt is
// never assumed to have supplied a sale simply because the price is the same.
// Supplier dispatches and physical return/correction need additional linked
// evidence and are rejected here instead of double-counting their relief.
export function planReviewedLotCostBridge({purchase,amount,allocations,assignments,movements,savedItems,through}){
 need(day(through)&&day(purchase.date)&&purchase.date<=through&&purchase.status==='posted'&&purchase.currency==='SAR'&&amount.kind==='invoice'&&amount.treatment==='domestic'&&Array.isArray(allocations)&&Array.isArray(assignments)&&purchase.items.length>0&&purchase.items.length<=200&&purchase.items.length===allocations.length);
 const gross=cents(amount.gross),deductible=cents(amount.deductibleVat);need(cents(amount.net)+cents(amount.vat)===gross&&deductible>0n&&deductible<=cents(amount.vat));
 const items=new Set(purchase.items.filter(l=>l.savedItemId).map(l=>l.savedItemId)),related=movements.filter(m=>items.has(m.itemId));need(related.length<=1000&&assignments.length<=1000);
 const seen=new Set(),byId=new Map();for(const m of related){need(m.id&&!seen.has(m.id)&&scope(m,purchase)&&day(m.date)&&m.date<=through&&typeof m.createdAt==='string'&&Number.isFinite(Date.parse(m.createdAt)));seen.add(m.id);byId.set(m.id,m);}
 const order=(a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
 const allocationMap=new Map(),usedLines=new Set(),assigned=new Map();for(const a of allocations){need(a.lineId&&!allocationMap.has(a.lineId));allocationMap.set(a.lineId,a);}
 for(const a of assignments){need(a.movementId&&!assigned.has(a.movementId)&&Array.isArray(a.lots)&&a.lots.length>0);assigned.set(a.movementId,a.lots);}
 const lots=new Map(),consumed=new Map();
 // Match the existing commercial warehouse ledger: inbound uses toWarehouseId,
 // outbound uses fromWarehouseId; missing location means the branch default.
 // The historical fixture alias is accepted only if it agrees with the real field.
 const warehouse=v=>{need(v===undefined||v===''||typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v));return v||'';};
 const operationalLocation=(m,direction)=>{const actual=warehouse(direction==='in'?m.toWarehouseId:m.fromWarehouseId),alias=warehouse(m.warehouseId);need(!actual||!alias||actual===alias);return actual||alias||'warehouse-'+purchase.branchId;};
 const location=(lot,id)=>lot.locations.get(id)??0n;
 const move=(lot,from,to,n)=>{need(location(lot,from)>=n);lot.locations.set(from,location(lot,from)-n);if(to!==null)lot.locations.set(to,location(lot,to)+n);};
 for(const m of [...related].sort(order)){
   need(!m.salesReturn&&!m.salesReturnCorrection&&!m.invoiceVoidStock&&!m.id.startsWith('fiscal-purchase-return:'));
   const q=signedQty(m.quantity);need(q!==0n);
   const transfer=m.type==='transfer';
   if(transfer)need(q>0n&&warehouse(m.fromWarehouseId)&&warehouse(m.toWarehouseId)&&m.fromWarehouseId!==m.toWarehouseId);
   if(!transfer&&q>0n){need(['purchase','opening','adjustment'].includes(m.type));lots.set(m.id,{movement:m,total:q,remaining:q,locations:new Map([[operationalLocation(m,'in'),q]])});continue;}
   need(transfer||['issue','adjustment'].includes(m.type));
   const from=(transfer?warehouse(m.fromWarehouseId):operationalLocation(m,'out')),to=transfer?warehouse(m.toWarehouseId):null;
   const slices=assigned.get(m.id);need(slices);assigned.delete(m.id);let total=0n;const refs=new Set();
   for(const a of slices){
     const n=qty(a.quantity),lot=lots.get(a.receiptId);need(n>0n&&lot&&lot.movement.itemId===m.itemId&&!refs.has(a.receiptId)&&n<=lot.remaining);refs.add(a.receiptId);
     move(lot,from,to,n);total+=n;
     if(!transfer){lot.remaining-=n;const arr=consumed.get(a.receiptId)??[];arr.push({movement:m,quantity:n});consumed.set(a.receiptId,arr);}
   }
   need(total===(transfer?q:-q));
 }
 need(assigned.size===0);
 for(const l of lots.values())need([...l.locations.values()].reduce((a,b)=>a+b,0n)===l.remaining);
 const lines=[],updates=[],claims=[],usedLots=new Set(),latest=new Map();let oldTotal=0n,reliefTotal=0n,inventoryRelief=0n,cogsRelief=0n,expenseRelief=0n;
 for(const m of [...related].sort(order))if(m.type==='purchase')latest.set(m.itemId,m.id);
 for(const l of purchase.items){need(l.id&&!usedLines.has(l.id));usedLines.add(l.id);const a=allocationMap.get(l.id);need(a);const quantity=qty(l.quantity),cost=l.landedUnitCost||l.unitCost,old=stockCostCents(l.quantity,cost),tax=cents(a.deductibleVat),corrected=stockCostCents(l.quantity,a.adjustedUnitCost);need(quantity>0n&&tax<=old&&corrected===old-tax);oldTotal+=old;reliefTotal+=tax;
   let remaining=0n,inv=0n,cogs=0n,expense=0n;
   if(l.savedItemId){const lot=lots.get(a.receiptMovementId),m=lot?.movement;need(m&&!usedLots.has(m.id)&&m.type==='purchase'&&m.sourceId===purchase.id&&m.date===purchase.date&&m.itemId===l.savedItemId&&m.sku===l.sku&&lot.total===quantity&&m.unitCost===cost);usedLots.add(m.id);remaining=lot.remaining;
     // An allocated issue must have recorded the original gross cost basis.
     // Otherwise its independently reviewed actual COGS needs a different bridge.
     let cumulative=0n,allocated=0n;for(const x of consumed.get(m.id)??[]){need(x.movement.unitCost===cost);cumulative+=x.quantity;const next=(tax*cumulative+quantity/2n)/quantity,delta=next-allocated;allocated=next;const bucket=x.movement.type==='issue'&&x.movement.id.startsWith('sales-invoice-stock:')?'cost-of-sales':'other-expense';if(bucket==='cost-of-sales')cogs+=delta;else expense+=delta;claims.push({receiptMovementId:m.id,movementId:x.movement.id,quantity:qfmt(x.quantity),relief:money(delta),account:bucket});}
     need(cumulative+remaining===quantity);inv=tax-allocated;
     if(latest.get(l.savedItemId)===m.id){const found=savedItems.filter(i=>i.id===l.savedItemId);need(found.length===1);const item=found[0];need(scope({...item,currency:item.lastCostCurrency},purchase)&&!item.archived&&item.inventoryTracking!=='non-stock'&&item.sku===l.sku&&item.unit===l.unit&&item.lastUnitCost===cost);updates.push({itemId:item.id,previousUnitCost:cost,correctedUnitCost:a.adjustedUnitCost});}
   }else{need(!a.receiptMovementId);expense=tax;}
   need(inv+cogs+expense===tax);inventoryRelief+=inv;cogsRelief+=cogs;expenseRelief+=expense;lines.push({lineId:l.id,itemId:l.savedItemId||null,movementId:a.receiptMovementId??null,originalAmount:money(old),deductibleVat:money(tax),correctedAmount:money(corrected),correctedUnitCost:a.adjustedUnitCost,remainingQuantity:qfmt(remaining),inventoryRelief:money(inv),cogsRelief:money(cogs),expenseRelief:money(expense)});
 }
 need(oldTotal===gross&&reliefTotal===deductible&&inventoryRelief+cogsRelief+expenseRelief===deductible&&new Set(updates.map(u=>u.itemId)).size===updates.length);
 return {grossPayable:money(gross),deductibleVat:money(deductible),correctedCost:money(gross-deductible),lines,updates,claims,valuationBridge:{inventoryRelief:money(inventoryRelief),cogsRelief:money(cogsRelief),expenseRelief:money(expenseRelief)}};
}

// Re-run the frozen reviewed calculation; the aggregate relief alone is not
// proof of its location, cost-of-sales attribution or original cost basis.
export function replayPostedCostAllocation({purchase,amount,record,review,movements,savedItems,digest}){
 need(typeof digest==='function'&&record?.plan&&review?.state==='approved'&&record.reviewDigest===digest(review)&&review.effectiveDate===record.effectiveDate&&record.purchaseId===purchase.id&&review.purchaseId===purchase.id&&Array.isArray(record.plan.historyBindings)&&Array.isArray(record.plan.updates)&&Array.isArray(review.allocations)&&review.allocationDigest===digest(review.allocations));
 const bindings=record.plan.historyBindings,ids=new Set(bindings.map(x=>x.movementId)),tracked=new Set(purchase.items.filter(x=>x.savedItemId).map(x=>x.savedItemId));
 need(ids.size===bindings.length&&bindings.length<=1000);
 const history=movements.filter(x=>ids.has(x.id)).sort((a,b)=>a.id.localeCompare(b.id));
 need(history.length===bindings.length&&history.every(m=>tracked.has(m.itemId)&&bindings.some(b=>b.movementId===m.id&&b.digest===digest(m))));
 // Later stock movements may legitimately change quantity or catalog cost.
 // Never infer their reviewed lot attribution, nor restate historic relief.
 for(const m of movements.filter(x=>tracked.has(x.itemId)&&!ids.has(x.id)))need(day(m.date)&&m.date>=record.effectiveDate&&Number.isFinite(Date.parse(m.createdAt))&&Date.parse(m.createdAt)>=Date.parse(record.committedAt));
 const updates=new Map(record.plan.updates.map(x=>[x.itemId,x]));need(updates.size===record.plan.updates.length);
 const historicalCatalog=savedItems.map(x=>updates.has(x.id)?{...x,archived:false,lastUnitCost:updates.get(x.id).previousUnitCost,lastCostCurrency:purchase.currency}:x);
 const args={purchase,amount,allocations:review.allocations,movements:history,savedItems:historicalCatalog};
 let expected;
 if(review.mode==='reviewed-lots'){
   need(Array.isArray(review.lotAssignments)&&review.lotAssignmentsDigest===digest(review.lotAssignments)&&review.movementDigest===digest(history));
   expected=planReviewedLotCostBridge({...args,assignments:review.lotAssignments,through:record.effectiveDate});
   expected={...expected,lotBindings:review.lotAssignments.map(a=>({movementId:a.movementId,digest:digest(a.lots.slice().sort((x,y)=>x.receiptId.localeCompare(y.receiptId)))}))};
 }else{
   need(review.mode===undefined);expected=planPurchaseCostCorrection(args);
   const inventory=expected.lines.filter(l=>l.itemId).reduce((n,l)=>n+cents(l.deductibleVat),0n);
   expected={...expected,valuationBridge:{inventoryRelief:money(inventory),cogsRelief:'0.00',expenseRelief:money(cents(expected.deductibleVat)-inventory)}};
 }
 expected={...expected,historyBindings:history.map(m=>({movementId:m.id,digest:digest(m)}))};
 need(digest(expected)===digest(record.plan));
 return {valuationBridge:expected.valuationBridge,historicalVerified:true,subsequentMovementCount:movements.filter(x=>tracked.has(x.itemId)&&!ids.has(x.id)).length};
}
