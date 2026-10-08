import type {InventoryMovementRecord,VaultPayload} from '../types.js';
import {assertGovernancePermission} from './governance.js';
import {assertSalesDeliveryIntegrity,confirmedSalesDeliveries,deliverySalesOrderContext} from './sales-delivery-flow.js';
import {warehouseItemQuantity,defaultWarehouseId} from './warehouses.js';
import {decimalToScaled} from './money.js';
import {t} from './i18n.js';

const PREFIX='sales-delivery-stock:';
const MARKER='@lourex:sales-order:stock-issue:v1:';
const quantity=(value:string):bigint=>decimalToScaled(value,4);
const issueId=(deliveryId:string,lineId:string)=>PREFIX+deliveryId+':'+lineId;
function fail(en:string,ar:string):never{throw new Error(t(en,ar));}
export interface PostSalesDeliveryStockInput{
  deliveryNoteId:string;
  expectedDeliveryNoteUpdatedAt:string;
  warehouseId:string;
  savedItemIds:string[];
  confirmed:boolean;
}
interface StockIssueProof{
  deliveryNoteId:string;deliveryNoteUpdatedAt:string;deliveryLineId:string;
  salesOrderLineId:string;customerId:string;reference:string;
  itemId:string;warehouseId:string;quantity:string;
}
export function isSalesDeliveryStockIssue(movement:InventoryMovementRecord):boolean{
  return movement.id.startsWith(PREFIX)||movement.note.startsWith(MARKER);
}
export function salesDeliveryStockIssues(deliveryId:string,movements:InventoryMovementRecord[]){
  return movements.filter(m=>m.type==='issue'&&m.sourceId===deliveryId&&isSalesDeliveryStockIssue(m));
}
export function postSalesDeliveryStock(vault:VaultPayload,input:PostSalesDeliveryStockInput):
{vault:VaultPayload;created:boolean}{
  assertGovernancePermission(vault,'issue-sales-stock');
  if(!input.confirmed)fail('Confirm the warehouse, stock items and quantities before issuing stock.','أكد المستودع والأصناف والكميات قبل صرف المخزون.');
  assertSalesDeliveryIntegrity(vault.documents,vault.documentEvents);
  assertSalesDeliveryStockIntegrity(vault);
  const delivery=vault.documents.find(doc=>doc.id===input.deliveryNoteId);
  const proofs=confirmedSalesDeliveries(input.deliveryNoteId,vault.documentEvents);
  if(!delivery||delivery.kind!=='delivery-note'||delivery.status!=='final'
    ||delivery.lifecycleStatus==='voided'||proofs.length!==1)
    fail('A confirmed issued Delivery Note is required.','يلزم سند تسليم صادر ومؤكد.');
  const proof=proofs[0]!;
  if(delivery.updatedAt!==input.expectedDeliveryNoteUpdatedAt
    ||proof.deliveryNoteUpdatedAt!==delivery.updatedAt)
    fail('Delivery Note changed. Reopen and review its stock mapping.','تغير سند التسليم. أعد فتحه وراجع ربط المخزون.');
  const prior=salesDeliveryStockIssues(delivery.id,vault.inventoryMovements);
  if(prior.length){
    if(prior.length!==proof.lines.length)fail('Incomplete stock issue evidence.','سجل صرف المخزون غير مكتمل.');
    return {vault,created:false};
  }
  const workspaceId=vault.appSettings.activeWorkspaceId,branchId=vault.appSettings.activeBranchId;
  const defaultId=defaultWarehouseId(branchId);
  const warehouse=vault.warehouses.find(w=>w.id===input.warehouseId&&w.active
    &&w.workspaceId===workspaceId&&w.branchId===branchId);
  if(!warehouse&&input.warehouseId!==defaultId)
    fail('Choose an active warehouse in this branch.','اختر مستودعًا نشطًا ضمن هذا الفرع.');
  if(!Array.isArray(input.savedItemIds)||input.savedItemIds.length!==proof.lines.length)
    fail('Select one catalog item for every delivered line.','اختر صنفًا من المخزون لكل بند مسلّم.');
  const context=deliverySalesOrderContext(delivery,vault.documents,vault.documentEvents);
  if(!context)fail('Accepted Sales Order is missing.','أمر البيع المعتمد غير موجود.');
  const remaining=new Map<string,bigint>(),now=new Date().toISOString();
  const movements=proof.lines.map((line,i)=>{
    const chosen=input.savedItemIds[i]?.trim()||'';
    const item=vault.savedItems.find(row=>row.id===chosen&&!row.archived);
    const docLine=delivery.items.find(row=>row.id===line.deliveryLineId);
    const orderLine=context.order.lines.find(row=>row.quotationLineId===line.salesOrderLineId);
    if(!item||!docLine||!orderLine||!chosen)
      fail('Map each delivered line to a distinct active catalog item.','اربط كل بند مسلّم بصنف مخزني نشط ومختلف.');
    if(item.workspaceId&&item.workspaceId!==workspaceId||item.branchId&&item.branchId!==branchId)
      fail('The catalog item belongs to another workspace or branch.','الصنف يعود إلى مساحة عمل أو فرع مختلف.');
    if(!item.sku?.trim())fail('Assign a SKU to the selected inventory item before posting.','أضف SKU للصنف المخزني قبل ترحيل الصرف.');
    if(item.unit.trim().toLowerCase()!==line.unit.trim().toLowerCase()
      ||docLine.unit!==line.unit||orderLine.unit!==line.unit
      ||quantity(line.quantity)!==quantity(docLine.quantity))
      fail('Stock unit or delivered quantity differs from confirmed delivery.','وحدة المخزون أو الكمية تختلف عن التسليم المؤكد.');
    const available=remaining.get(chosen)??warehouseItemQuantity(chosen,input.warehouseId,vault.inventoryMovements,defaultId);
    const qty=quantity(line.quantity);
    if(qty<=0n||available<qty)fail('Insufficient available stock in selected warehouse.','الرصيد المتاح غير كافٍ في المستودع المحدد.');
    remaining.set(chosen,available-qty);
    const proofRow:StockIssueProof={deliveryNoteId:delivery.id,deliveryNoteUpdatedAt:delivery.updatedAt,
      deliveryLineId:line.deliveryLineId,salesOrderLineId:line.salesOrderLineId,customerId:proof.customerId,
      reference:proof.reference,itemId:chosen,warehouseId:input.warehouseId,quantity:line.quantity};
    return{id:issueId(delivery.id,line.deliveryLineId),itemId:chosen,itemNameEn:item.descriptionEn,
      itemNameAr:item.descriptionAr,sku:item.sku||'',date:proof.deliveredDate,type:'issue' as const,
      quantity:'-'+(qty/10000n).toString()+'.'+(qty%10000n).toString().padStart(4,'0'),
      unitCost:item.lastUnitCost||'',currency:item.lastCostCurrency||'',sourceId:delivery.id,
      sourceNumber:delivery.number,note:MARKER+JSON.stringify(proofRow),fromWarehouseId:input.warehouseId,
      workspaceId,branchId,createdAt:now};
  });
  const next={...vault,inventoryMovements:[...vault.inventoryMovements,...movements]};
  assertSalesDeliveryStockIntegrity(next);
  return {vault:next,created:true};
}
export function assertSalesDeliveryStockIntegrity(vault:Pick<VaultPayload,
'documents'|'documentEvents'|'inventoryMovements'|'savedItems'|'warehouses'|'appSettings'>):void{
  const linked=vault.inventoryMovements.filter(isSalesDeliveryStockIssue);
  if(!linked.length)return;
  assertSalesDeliveryIntegrity(vault.documents,vault.documentEvents);
  const byDelivery=new Map<string,InventoryMovementRecord[]>();
  for(const m of linked){
    if(!m.note.startsWith(MARKER)||m.type!=='issue'||!m.sourceId||!m.fromWarehouseId)
      fail('Stock issue record is incomplete or altered.','سجل صرف المخزون ناقص أو تم تعديله.');
    const list=byDelivery.get(m.sourceId)||[];list.push(m);byDelivery.set(m.sourceId,list);
  }
  for(const [deliveryId,rows] of byDelivery){
    const delivery=vault.documents.find(d=>d.id===deliveryId);
    const proofs=confirmedSalesDeliveries(deliveryId,vault.documentEvents);
    if(!delivery||proofs.length!==1||rows.length!==proofs[0]!.lines.length)
      fail('Stock issue does not match a complete confirmed delivery.','صرف المخزون لا يطابق تسليمًا مؤكدًا مكتملًا.');
    const proof=proofs[0]!,context=deliverySalesOrderContext(delivery,vault.documents,vault.documentEvents);
    if(!context)fail('Stock issue lost its accepted Sales Order.','فقد سجل الصرف أمر البيع المعتمد.');
    const ids=new Set<string>();
    for(const movement of rows){
      let record:StockIssueProof;
      try{record=JSON.parse(movement.note.slice(MARKER.length)) as StockIssueProof;}catch{fail('Stock evidence is corrupted.','بيانات إثبات الصرف تالفة.');}
      const line=proof.lines.find(item=>item.deliveryLineId===record.deliveryLineId);
      const saved=vault.savedItems.find(item=>item.id===record.itemId&&!item.archived);
      if(!line||!saved||ids.has(line.deliveryLineId)
        ||movement.id!==issueId(delivery.id,line.deliveryLineId)
        ||record.deliveryNoteId!==delivery.id||record.deliveryNoteUpdatedAt!==delivery.updatedAt
        ||record.salesOrderLineId!==line.salesOrderLineId||record.customerId!==proof.customerId
        ||record.reference!==proof.reference||record.quantity!==line.quantity
        ||record.warehouseId!==movement.fromWarehouseId||record.itemId!==movement.itemId
        ||movement.sourceId!==delivery.id||movement.sourceNumber!==delivery.number
        ||movement.date!==proof.deliveredDate||quantity(movement.quantity)!==-quantity(line.quantity)
        ||!saved.sku?.trim()||movement.sku!==(saved.sku||'')
        ||saved.unit.trim().toLowerCase()!==line.unit.trim().toLowerCase()
        ||!vault.warehouses.some(w=>w.id===movement.fromWarehouseId
          &&w.workspaceId===movement.workspaceId&&w.branchId===movement.branchId)
        ||movement.workspaceId!==delivery.workspaceId&&Boolean(delivery.workspaceId)
        ||movement.branchId!==delivery.branchId&&Boolean(delivery.branchId))
        fail('Issued stock diverges from immutable physical delivery.','حركة المخزون تختلف عن إثبات التسليم الفعلي.');
      ids.add(line.deliveryLineId);
    }
  }
  for(const m of linked){
    const scope=vault.appSettings,defaultId=defaultWarehouseId(m.branchId||scope.activeBranchId);
    const stock=warehouseItemQuantity(m.itemId,m.fromWarehouseId!,vault.inventoryMovements,defaultId);
    if(stock<0n)fail('Stock issue would make warehouse balance negative.','صرف المخزون يجعل رصيد المستودع سالبًا.');
  }
}

/** Check both sides of a concurrent merge before same-ID record deduplication. */
export function assertSalesStockLedgerContinuity(
  base:InventoryMovementRecord[],intended:InventoryMovementRecord[],latest:InventoryMovementRecord[]
):void{
  for(const records of [base,intended,latest]){
    const ids=new Map<string,InventoryMovementRecord>();
    for(const row of records){
      const previous=ids.get(row.id);
      if(previous&&(isSalesDeliveryStockIssue(row)||isSalesDeliveryStockIssue(previous)))
        fail('Duplicate stock issue movement ID in offline data.','معرف حركة صرف المخزون مكرر في البيانات المحلية.');
      ids.set(row.id,row);
    }
  }
  const b=new Map(base.map(m=>[m.id,m])),w=new Map(intended.map(m=>[m.id,m])),l=new Map(latest.map(m=>[m.id,m]));
  const same=(x:InventoryMovementRecord,y:InventoryMovementRecord)=>JSON.stringify(x)===JSON.stringify(y);
  for(const row of base){
    if(!isSalesDeliveryStockIssue(row))continue;
    const wanted=w.get(row.id),remote=l.get(row.id);
    if(!wanted||!remote||!same(row,wanted)||!same(row,remote))
      fail('Immutable sales stock history was rewritten or removed.','تم تغيير أو حذف سجل صرف المخزون الثابت.');
  }
  for(const row of intended){
    const remote=l.get(row.id);
    if(remote&&(isSalesDeliveryStockIssue(row)||isSalesDeliveryStockIssue(remote))&&!same(row,remote))
      fail('Concurrent stock issue conflict for the same delivery line.','تعارض صرف المخزون بين جهازين لنفس بند التسليم.');
  }
  for(const row of latest){
    const wanted=w.get(row.id);
    if(wanted&&(isSalesDeliveryStockIssue(row)||isSalesDeliveryStockIssue(wanted))&&!same(row,wanted))
      fail('Concurrent stock issue conflict for the same delivery line.','تعارض صرف المخزون بين جهازين لنفس بند التسليم.');
  }
}
