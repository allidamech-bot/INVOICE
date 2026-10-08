import type { DocumentEventRecord, LourexDocument, VaultPayload } from '../types.js';
import { assertGovernancePermission } from './governance.js';
import { createDocumentEvent } from './document-lifecycle.js';
import { validateDocument } from './documents.js';
import { decimalToScaled, isNonNegativeDecimalInput, normalizeDecimalInput } from './money.js';
import { isIsoDate, todayIso } from './id.js';
import { t } from './i18n.js';

const GRN_MARKER='@lourex:goods-receipt:confirmed:v1:';
const QUANTITY_SCALE=10_000n;
const QTY_PATTERN=/^\d{1,15}(?:\.\d{1,4})?$/;

export interface GoodsReceiptLine{
  purchaseOrderLineId:string;
  quantity:string;
  unit:string;
}
export interface ConfirmedGoodsReceipt{
  purchaseOrderId:string;
  purchaseOrderNumber:string;
  purchaseOrderUpdatedAt:string;
  reference:string;
  receivedDate:string;
  receivedByMemberId:string;
  supplierId:string;
  notes:string;
  lines:GoodsReceiptLine[];
}
export interface ConfirmGoodsReceiptInput{
  purchaseOrderId:string;
  expectedPurchaseOrderUpdatedAt:string;
  reference:string;
  receivedDate:string;
  notes?:string;
  quantities:string[];
}
export interface GoodsReceiptBalance{
  purchaseOrderLineId:string;
  ordered:string;
  received:string;
  remaining:string;
}

function error(en:string,ar:string):never{throw new Error(t(en,ar));}
function scaled(value:string):bigint{return decimalToScaled(value,4);}
function format(value:bigint):string{
  const negative=value<0n?'-':'',abs=negative?-value:value;
  return (negative+`${abs/QUANTITY_SCALE}.${(abs%QUANTITY_SCALE).toString().padStart(4,'0')}`).replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
}

/** GRNs are immutable audit evidence, NOT physical stock postings or supplier invoices. */
export function confirmedGoodsReceipts(purchaseOrderId:string,events:DocumentEventRecord[]):ConfirmedGoodsReceipt[]{
  return events.filter(event=>event.documentId===purchaseOrderId&&event.type==='audit'&&event.note.startsWith(GRN_MARKER))
    .flatMap(event=>{
      try{
        const row=JSON.parse(event.note.slice(GRN_MARKER.length)) as ConfirmedGoodsReceipt;
        if(!row||row.purchaseOrderId!==purchaseOrderId||!row.reference||!isIsoDate(row.receivedDate)
          ||!Array.isArray(row.lines)||!row.lines.length
          ||row.lines.some(line=>typeof line.purchaseOrderLineId!=='string'||!line.purchaseOrderLineId||typeof line.quantity!=='string'
            ||!QTY_PATTERN.test(line.quantity)||scaled(line.quantity)<=0n||typeof line.unit!=='string'||!line.unit))return[];
        return [row];
      }catch{return[];}
    });
}

export function goodsReceiptBalances(order:LourexDocument,events:DocumentEventRecord[]):GoodsReceiptBalance[]{
  const receipts=confirmedGoodsReceipts(order.id,events);
  return order.items.map(item=>{
    const ordered=scaled(item.quantity);
    const received=receipts.reduce((total,row)=>total+row.lines.reduce((subtotal,line)=>subtotal+
      (line.purchaseOrderLineId===item.id?scaled(line.quantity):0n),0n),0n);
    return {purchaseOrderLineId:item.id,ordered:format(ordered),received:format(received),remaining:format(ordered-received)};
  });
}

export function confirmGoodsReceipt(vault:VaultPayload,input:ConfirmGoodsReceiptInput):
  {vault:VaultPayload;receipt:ConfirmedGoodsReceipt}{
  const actor=assertGovernancePermission(vault,'record-goods-receipt');
  const order=vault.documents.find(doc=>doc.id===input.purchaseOrderId);
  if(!order||order.kind!=='purchase-order'||order.role!=='standard'||order.status!=='final'
    ||order.lifecycleStatus==='voided')error('Goods receipt requires an active issued Purchase Order.','يتطلب استلام البضاعة أمر شراء صادرًا وساريًا.');
  if(!input.expectedPurchaseOrderUpdatedAt||input.expectedPurchaseOrderUpdatedAt!==order.updatedAt)
    error('Purchase Order changed. Reopen its latest version.','تغير أمر الشراء. افتح أحدث نسخة وراجعها.');
  if(Object.keys(validateDocument(order)).length)
    error('Purchase Order is invalid; correct it before receiving goods.','أمر الشراء غير صالح. صححه قبل استلام البضاعة.');
  const supplierId=order.supplierSnapshot?.sourceSupplierId?.trim()||'';
  if(!supplierId||!vault.suppliers.some(supplier=>supplier.id===supplierId))
    error('The Purchase Order requires a registered supplier.','يتطلب أمر الشراء موردًا مسجلًا.');
  const reference=input.reference.trim(),date=input.receivedDate.trim(),notes=(input.notes||'').trim();
  if(!reference||reference.length>100||/[\u0000-\u001f]/.test(reference))
    error('Goods receipt reference is required (100 characters maximum).','مرجع الاستلام مطلوب، بحد أقصى 100 حرف.');
  if(!isIsoDate(date)||date>todayIso()||date<order.issueDate)
    error('Receipt date must be valid, not in the future or before PO issuance.','تاريخ الاستلام يجب أن يكون صحيحًا وألا يسبق إصدار الطلب أو يقع في المستقبل.');
  if(notes.length>500||/[\u0000-\u001f]/.test(notes))
    error('Receipt notes are too long or invalid.','ملاحظات الاستلام طويلة جدًا أو غير صالحة.');
  if(!Array.isArray(input.quantities)||input.quantities.length!==order.items.length||!order.items.length)
    error('Receipt lines must exactly match Purchase Order lines.','يجب أن تتطابق بنود الاستلام مع بنود أمر الشراء.');
  const previous=confirmedGoodsReceipts(order.id,vault.documentEvents);
  if(previous.some(row=>row.reference.trim().toLowerCase()===reference.toLowerCase()))
    error('This goods receipt reference is already recorded for this Purchase Order.','مرجع الاستلام مسجل مسبقًا لأمر الشراء هذا.');
  const totals=goodsReceiptBalances(order,vault.documentEvents);
  const quantities=input.quantities.map((raw,index)=>{
    const value=normalizeDecimalInput(raw.trim()||'0');
    if(!isNonNegativeDecimalInput(value)||!QTY_PATTERN.test(value))
      error('Receipt quantities must be non-negative with at most four decimals.','كميات الاستلام يجب أن تكون غير سالبة وبحد أقصى أربع خانات عشرية.');
    const received=scaled(value),balance=totals[index];
    if(!balance)error('Missing Purchase Order line.','أحد بنود أمر الشراء مفقود.');
    if(scaled(balance.remaining)<0n)error('Purchase Order has conflicting prior receipts.','يوجد تعارض في الاستلامات السابقة.');
    if(received>scaled(balance.remaining))
      error('Receipt exceeds the unreceived Purchase Order quantity.','الاستلام يتجاوز الكمية المتبقية في أمر الشراء.');
    return received;
  });
  if(!quantities.some(value=>value>0n))
    error('At least one item must have a received quantity above zero.','يجب استلام كمية أكبر من صفر لصنف واحد على الأقل.');
  const lines:GoodsReceiptLine[]=order.items.flatMap((item,index)=>{
    const received=quantities[index]??0n;
    return received>0n?[{purchaseOrderLineId:item.id,quantity:format(received),unit:item.unit}]:[];
  });
  const receipt:ConfirmedGoodsReceipt={
    purchaseOrderId:order.id,purchaseOrderNumber:order.number,purchaseOrderUpdatedAt:order.updatedAt,
    reference,receivedDate:date,receivedByMemberId:actor.id,supplierId,notes,lines
  };
  const event=createDocumentEvent(order,'audit',GRN_MARKER+JSON.stringify(receipt));
  return {vault:{...vault,documentEvents:[...vault.documentEvents,event]},receipt};
}

/** Fail closed if two offline devices merge independently valid receipts that exceed a PO. */
export function assertGoodsReceiptIntegrity(documents:LourexDocument[],events:DocumentEventRecord[]):void{
  const receiptEvents=events.filter(event=>event.type==='audit'&&event.note.startsWith(GRN_MARKER));
  if(!receiptEvents.length)return;
  const orders=new Map(documents.filter(doc=>doc.kind==='purchase-order').map(doc=>[doc.id,doc]));
  const affected=new Set(receiptEvents.map(event=>event.documentId));
  for(const orderId of affected){
    const order=orders.get(orderId);
    if(!order)error('A received Purchase Order was removed during merge. Restore it before syncing.','حُذف أمر شراء له محاضر استلام أثناء الدمج. استعده قبل المزامنة.');
    const receipts=confirmedGoodsReceipts(orderId,events);
    const refs=new Set<string>();
    const lines=new Map(order.items.map(item=>[item.id,item]));
    for(const receipt of receipts){
      const normalizedRef=receipt.reference.trim().toLowerCase();
      if(refs.has(normalizedRef))error('Duplicate goods receipt reference found while syncing.','اكتُشف تكرار مرجع الاستلام أثناء المزامنة.');
      refs.add(normalizedRef);
      if(receipt.purchaseOrderNumber!==order.number||receipt.supplierId!==order.supplierSnapshot?.sourceSupplierId)
        error('Goods receipt supplier or Purchase Order identity changed.','تغيرت هوية المورد أو أمر الشراء المرتبط بمحضر الاستلام.');
      const lineIds=new Set<string>();
      for(const line of receipt.lines){
        const source=lines.get(line.purchaseOrderLineId);
        if(!source||line.unit!==source.unit||lineIds.has(line.purchaseOrderLineId))
          error('Goods receipt has duplicated or mismatched PO lines.','يتضمن الاستلام بنودًا مكررة أو غير متطابقة مع أمر الشراء.');
        lineIds.add(line.purchaseOrderLineId);
      }
    }
    for(const balance of goodsReceiptBalances(order,events)){
      if(scaled(balance.remaining)<0n)
        error('Concurrent receipts exceed ordered quantity. Reconcile before syncing.','تتجاوز الاستلامات المتزامنة الكمية المطلوبة. راجعها قبل المزامنة.');
    }
  }
}
