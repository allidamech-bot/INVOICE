import type {InventoryMovementRecord,LourexDocument,VaultPayload} from '../types.js';
import {decimalToScaled,isDecimalInput} from './money.js';
import {warehouseItemQuantity,defaultWarehouseId} from './warehouses.js';
import {inventoryMovementAccountingIsValid} from './operations.js';
import {invoiceSourceDelivery} from './sales-delivery-invoice.js';
import {salesDeliveryStockIssues} from './sales-delivery-stock.js';
import {t} from './i18n.js';

/** New issue source is an issued INVOICE, never a payment, quote or PDF print. */
export const INVOICE_STOCK_PREFIX='sales-invoice-stock:';
const PROOF='@lourex:invoice-stock:v1:';
const DELIVERY_LINK='@lourex:sales-order:delivery-invoice:v1:';
const qty=(value:string)=>decimalToScaled(value,4);
const fail=(en:string,ar:string):never=>{throw new Error(t(en,ar));};
const fixed=(value:bigint):string=>{
  const negative=value<0n,absolute=negative?-value:value;
  return (negative?'-':'')+(absolute/10000n).toString()+'.'+(absolute%10000n).toString().padStart(4,'0');
};
const movementId=(documentId:string,lineId:string)=>INVOICE_STOCK_PREFIX+documentId+':'+lineId;

interface InvoiceStockProof {
  invoiceId:string; lineId:string; itemId:string;
  warehouseId:string; quantity:string; unit:string;
}
interface DeliveryInvoiceLineProof { invoiceLineId:string; deliveryLineId:string; quantity:string }
interface DeliveryInvoiceProof { invoiceId:string; deliveryNoteId:string; lines:DeliveryInvoiceLineProof[] }

export function isIssuedInvoiceStockIssue(m:InventoryMovementRecord):boolean{
  return m.id.startsWith(INVOICE_STOCK_PREFIX)||m.note.startsWith(PROOF);
}
function proofOf(m:InventoryMovementRecord):InvoiceStockProof{
  if(!m.note.startsWith(PROOF))fail('Invalid invoice stock proof.','إثبات حركة مخزون الفاتورة غير صالح.');
  try{
    const proof=JSON.parse(m.note.slice(PROOF.length)) as InvoiceStockProof;
    if(!proof?.invoiceId||!proof?.lineId||!proof?.itemId||!proof?.warehouseId||!proof?.unit||!proof?.quantity)return fail('Incomplete invoice stock proof.','إثبات حركة الفاتورة غير مكتمل.');
    return proof;
  }catch{return fail('Invalid invoice stock evidence.','إثبات حركة الفاتورة تالف.');}
}
function deliveryEvidence(vault:VaultPayload,invoiceId:string):DeliveryInvoiceProof|null{
  const related=vault.documentEvents.filter(event=>event.documentId===invoiceId&&event.note.startsWith(DELIVERY_LINK));
  if(!related.length)return null;
  if(related.length!==1)fail('Duplicate delivery-to-invoice links.','توجد روابط تسليم مكررة للفاتورة.');
  try{
    const proof=JSON.parse(related[0]!.note.slice(DELIVERY_LINK.length)) as DeliveryInvoiceProof;
    if(proof.invoiceId!==invoiceId||!proof.deliveryNoteId||!Array.isArray(proof.lines)||!proof.lines.length)return fail('Invalid delivery invoice link.','رابط فاتورة التسليم غير صالح.');
    return proof;
  }catch{return fail('Unreadable delivery invoice link.','تعذر قراءة رابط فاتورة التسليم.');}
}
function assertExistingInvoiceIssues(doc:LourexDocument,existing:InventoryMovementRecord[],expectedIds:Set<string>,branchId:string):void{
  if(existing.length!==expectedIds.size)fail('Invoice stock posting is incomplete.','ترحيل مخزون الفاتورة غير مكتمل.');
  const seen=new Set<string>();
  for(const movement of existing){
    const proof=proofOf(movement);
    const line=doc.items.find(item=>item.id===proof.lineId);
    if(seen.has(movement.id)||!expectedIds.has(movement.id)||movement.id!==movementId(doc.id,proof.lineId)
      ||movement.sourceId!==doc.id||movement.sourceNumber!==doc.number||movement.type!=='issue'
      ||!inventoryMovementAccountingIsValid(movement)||!line
      ||line.savedItemId!==proof.itemId||line.stockTreatment==='non-stock'
      ||line.unit!==proof.unit||!isDecimalInput(line.quantity)||qty(line.quantity)<=0n
      ||qty(movement.quantity)!==-qty(line.quantity)||qty(proof.quantity)!==qty(line.quantity)
      ||movement.itemId!==proof.itemId||movement.fromWarehouseId!==proof.warehouseId
      ||Boolean(movement.branchId)&&movement.branchId!==branchId)
      fail('Issued invoice differs from immutable stock history.','تختلف الفاتورة الصادرة عن سجل المخزون الثابت.');
    seen.add(movement.id);
  }
}

/** Pure calculation: callers must persist invoice, events AND movements in ONE vault mutation. */
export function postIssuedInvoiceStock(vault:VaultPayload,doc:LourexDocument):
  {vault:VaultPayload;created:boolean;legacyDelivery:boolean}{
  if(doc.kind!=='invoice'||doc.role!=='standard'||doc.status!=='final'||doc.lifecycleStatus==='voided')
    return {vault,created:false,legacyDelivery:false};
  const workspaceId=vault.appSettings.activeWorkspaceId,branchId=vault.appSettings.activeBranchId;
  if(doc.workspaceId&&doc.workspaceId!==workspaceId||doc.branchId&&doc.branchId!==branchId)
    fail('Invoice belongs to another workspace or branch.','الفاتورة تعود إلى مساحة عمل أو فرع مختلف.');
  const linkedDelivery=invoiceSourceDelivery(doc.id,vault.documents,vault.documentEvents);
  const legacy=linkedDelivery?salesDeliveryStockIssues(linkedDelivery.id,vault.inventoryMovements):[];
  const linkedProof=linkedDelivery?deliveryEvidence(vault,doc.id):null;
  if(legacy.length){
    // A real historic stock issue is never posted again when its delivery is invoiced.
    if(!linkedProof)throw new Error('Historic delivery stock link is missing.');
    if(legacy.length!==linkedProof.lines.length||doc.items.length!==linkedProof.lines.length)
      fail('Historic delivery stock issue requires reconciliation before invoicing.','يجب مطابقة الصرف التاريخي للتسليم قبل إصدار الفاتورة.');
    const used=new Set<string>();
    for(const line of linkedProof.lines){
      const invoiceLine=doc.items.find(item=>item.id===line.invoiceLineId);
      const stockLine=legacy.find(m=>m.id==='sales-delivery-stock:'+linkedDelivery!.id+':'+line.deliveryLineId);
      if(!invoiceLine||!stockLine)throw new Error('Historic delivery invoice line is missing.');
      if(used.has(stockLine.id)||stockLine.type!=='issue'
        ||!isDecimalInput(invoiceLine.quantity)||qty(invoiceLine.quantity)<=0n
        ||qty(stockLine.quantity)!==-qty(invoiceLine.quantity)||qty(line.quantity)!==qty(invoiceLine.quantity)
        ||invoiceLine.unit!==vault.savedItems.find(item=>item.id===stockLine.itemId)?.unit
        ||invoiceLine.stockTreatment==='non-stock'
        ||invoiceLine.savedItemId&&invoiceLine.savedItemId!==stockLine.itemId)
        fail('Historic delivery stock differs from invoice lines.','صرف سند التسليم السابق لا يطابق بنود الفاتورة.');
      used.add(stockLine.id);
    }
    if(vault.inventoryMovements.some(m=>m.sourceId===doc.id&&isIssuedInvoiceStockIssue(m)))
      fail('Both delivery and invoice stock issues exist for one sale.','توجد حركتا صرف للتسليم والفاتورة لنفس البيع.');
    return {vault,created:false,legacyDelivery:true};
  }
  const defaultId=defaultWarehouseId(branchId);
  const existing=vault.inventoryMovements.filter(m=>m.sourceId===doc.id&&isIssuedInvoiceStockIssue(m));
  const expected=new Set<string>();
  const remaining=new Map<string,bigint>();
  const created:InventoryMovementRecord[]=[];
  for(const line of doc.items){
    if(line.stockTreatment==='non-stock'){
      if(line.savedItemId)fail('Non-stock lines cannot point to tracked stock.','البند غير المخزني لا يجوز ربطه بمخزون قابل للخصم.');
      continue;
    }
    if(!line.savedItemId||line.stockTreatment!=='tracked')
      fail('Each invoice line must select a catalog stock item or be explicitly non-stock.','يجب ربط كل بند فاتورة بصنف مخزني أو تحديده صراحة كبند غير مخزني.');
    const item=vault.savedItems.find(row=>row.id===line.savedItemId&&!row.archived);
    if(!item)throw new Error('Stock item is missing, archived, untracked or outside this branch.');
    if(item.inventoryTracking==='non-stock'
      ||item.workspaceId&&item.workspaceId!==workspaceId||item.branchId&&item.branchId!==branchId)
      fail('Stock item is missing, archived, untracked or outside this branch.','الصنف المخزني غير صالح أو مؤرشف أو خارج الفرع.');
    if(!item.sku?.trim()||line.skuSnapshot!==item.sku)
      fail('Invoice SKU link is unverified. Reselect the catalog item.','رابط SKU في الفاتورة غير مؤكد. أعد اختيار الصنف.');
    if(line.unit.trim().toLowerCase()!==item.unit.trim().toLowerCase())
      fail('Invoice unit differs from the catalog unit. Define a conversion before posting.','وحدة الفاتورة تختلف عن الصنف. عرّف التحويل قبل الترحيل.');
    if(!isDecimalInput(line.quantity)||qty(line.quantity)<=0n)
      fail('Invoice stock quantity must be positive and precise.','يجب أن تكون كمية الفاتورة المخزنية موجبة ودقيقة.');
    const q=qty(line.quantity),current=remaining.get(item.id)??warehouseItemQuantity(item.id,defaultId,vault.inventoryMovements,defaultId);
    if(!existing.length&&q>current)fail('Insufficient stock for invoice issue.','الرصيد لا يكفي لإصدار الفاتورة.');
    remaining.set(item.id,current-q);
    const id=movementId(doc.id,line.id);
    if(expected.has(id))fail('Duplicate invoice line identity.','معرف بند الفاتورة مكرر.');
    expected.add(id);
    const proof:InvoiceStockProof={invoiceId:doc.id,lineId:line.id,itemId:item.id,warehouseId:defaultId,quantity:line.quantity,unit:line.unit};
    created.push({id,itemId:item.id,itemNameEn:item.descriptionEn,itemNameAr:item.descriptionAr,
      sku:item.sku||'',date:doc.issueDate,type:'issue',quantity:fixed(-q),
      unitCost:item.lastUnitCost||'',currency:item.lastCostCurrency||'',sourceId:doc.id,
      sourceNumber:doc.number,note:PROOF+JSON.stringify(proof),fromWarehouseId:defaultId,
      workspaceId,branchId,createdAt:new Date().toISOString()});
  }
  if(existing.length){
    assertExistingInvoiceIssues(doc,existing,expected,branchId);
    return {vault,created:false,legacyDelivery:false};
  }
  if(!created.length)return {vault,created:false,legacyDelivery:false};
  return {vault:{...vault,inventoryMovements:[...vault.inventoryMovements,...created]},created:true,legacyDelivery:false};
}

/** Reject duplicate IDs, deletion and same-ID modification across offline merge inputs. */
export function assertInvoiceStockLedgerContinuity(base:InventoryMovementRecord[],intended:InventoryMovementRecord[],latest:InventoryMovementRecord[]):void{
  for(const rows of [base,intended,latest]){
    const byId=new Map<string,InventoryMovementRecord>();
    for(const row of rows){
      const old=byId.get(row.id);
      if(old&&(isIssuedInvoiceStockIssue(old)||isIssuedInvoiceStockIssue(row)))
        fail('Duplicate invoice stock movement ID.','معرف حركة مخزون الفاتورة مكرر.');
      byId.set(row.id,row);
    }
  }
  const desired=new Map(intended.map(m=>[m.id,m])),remote=new Map(latest.map(m=>[m.id,m]));
  for(const m of base){
    if(!isIssuedInvoiceStockIssue(m))continue;
    if(JSON.stringify(desired.get(m.id))!==JSON.stringify(m)||JSON.stringify(remote.get(m.id))!==JSON.stringify(m))
      fail('Invoice stock movement is immutable.','لا يجوز تعديل أو حذف حركة مخزون الفاتورة.');
  }
  for(const m of intended){
    const other=remote.get(m.id);
    if(other&&(isIssuedInvoiceStockIssue(m)||isIssuedInvoiceStockIssue(other))&&JSON.stringify(other)!==JSON.stringify(m))
      fail('Conflicting invoice stock movement.','تعارضت حركة مخزون الفاتورة بين جهازين.');
  }
}
