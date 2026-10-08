import type { DocumentEventRecord, LourexDocument, VaultPayload } from '../types.js';
import { assertGovernancePermission } from './governance.js';
import { createDocumentEvent } from './document-lifecycle.js';
import { validateDocument } from './documents.js';
import { confirmedGoodsReceipts, assertGoodsReceiptIntegrity } from './goods-receipt-flow.js';
import { compareMoneyStrings, decimalToScaled, isNonNegativeDecimalInput, lineTotal, normalizeDecimalInput } from './money.js';
import { isIsoDate, todayIso } from './id.js';
import { t } from './i18n.js';

const INVOICE_MARKER='@lourex:supplier-invoice:matched:v1:';
const QUANTITY_SCALE=10_000n;
const QUANTITY_PATTERN=/^\d{1,15}(?:\.\d{1,4})?$/;
const PRICE_PATTERN=/^\d{1,15}(?:\.\d{1,4})?$/;
const TOTAL_PATTERN=/^\d{1,18}(?:\.\d{1,2})?$/;

export interface SupplierInvoiceMatchedLine{
  purchaseOrderLineId:string;
  quantity:string;
  unit:string;
  unitPrice:string;
  lineTotal:string;
}
export interface MatchedSupplierInvoice{
  purchaseOrderId:string;
  purchaseOrderNumber:string;
  purchaseOrderUpdatedAt:string;
  supplierId:string;
  currency:string;
  invoiceReference:string;
  invoiceDate:string;
  dueDate:string;
  acceptedAt:string;
  reviewedByMemberId:string;
  notes:string;
  total:string;
  lines:SupplierInvoiceMatchedLine[];
}
export interface MatchSupplierInvoiceInput{
  purchaseOrderId:string;
  expectedPurchaseOrderUpdatedAt:string;
  invoiceReference:string;
  invoiceDate:string;
  dueDate:string;
  quantities:string[];
  unitPrices:string[];
  statedTotal:string;
  notes?:string;
}
export interface SupplierInvoiceLineBalance{
  purchaseOrderLineId:string;
  ordered:string;
  received:string;
  previouslyMatched:string;
  availableToMatch:string;
  unitPrice:string;
}

function fail(en:string,ar:string):never{throw new Error(t(en,ar));}
function scaled(value:string):bigint{return decimalToScaled(value,4);}
function fmt(value:bigint):string{
  const neg=value<0n?'-':'',abs=value<0n?-value:value;
  return (neg+`${abs/QUANTITY_SCALE}.${(abs%QUANTITY_SCALE).toString().padStart(4,'0')}`).replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
}
function validPrice(value:string):boolean{return PRICE_PATTERN.test(value)&&isNonNegativeDecimalInput(value);}
function validQuantity(value:string):boolean{return QUANTITY_PATTERN.test(value)&&isNonNegativeDecimalInput(value)&&scaled(value)>0n;}

/** Immutable matched invoices; never interpret a match as a posted accounting liability. */
export function matchedSupplierInvoices(orderId:string,events:DocumentEventRecord[]):MatchedSupplierInvoice[]{
  return events.filter(event=>event.documentId===orderId&&event.type==='audit'&&event.note.startsWith(INVOICE_MARKER))
    .flatMap(event=>{
      try{
        const row=JSON.parse(event.note.slice(INVOICE_MARKER.length)) as MatchedSupplierInvoice;
        if(!row||row.purchaseOrderId!==orderId||!row.invoiceReference||!row.supplierId
          ||!isIsoDate(row.invoiceDate)||!isIsoDate(row.dueDate)||!row.currency
          ||!Array.isArray(row.lines)||!row.lines.length
          ||row.lines.some(line=>!line.purchaseOrderLineId||!line.unit||!validQuantity(line.quantity)
            ||!validPrice(line.unitPrice)||!TOTAL_PATTERN.test(line.lineTotal)))return[];
        return [row];
      }catch{return[];}
    });
}

export function supplierInvoiceLineBalances(order:LourexDocument,events:DocumentEventRecord[]):SupplierInvoiceLineBalance[]{
  const received=confirmedGoodsReceipts(order.id,events),invoices=matchedSupplierInvoices(order.id,events);
  return order.items.map(item=>{
    const receivedQty=received.reduce((sum,receipt)=>sum+receipt.lines.reduce((sub,line)=>
      sub+(line.purchaseOrderLineId===item.id?scaled(line.quantity):0n),0n),0n);
    const matchedQty=invoices.reduce((sum,invoice)=>sum+invoice.lines.reduce((sub,line)=>
      sub+(line.purchaseOrderLineId===item.id?scaled(line.quantity):0n),0n),0n);
    return {purchaseOrderLineId:item.id,ordered:fmt(scaled(item.quantity)),received:fmt(receivedQty),
      previouslyMatched:fmt(matchedQty),availableToMatch:fmt(receivedQty-matchedQty),unitPrice:item.unitPrice};
  });
}

function parseReference(value:string):string{
  const reference=value.trim();
  if(!reference||reference.length>100||/[\u0000-\u001f]/.test(reference))
    fail('Supplier invoice reference is required (up to 100 characters).','مرجع فاتورة المورد مطلوب بحد أقصى 100 حرف.');
  return reference;
}
function parsePrice(value:string):string{
  const normalized=normalizeDecimalInput(value);
  if(!validPrice(normalized))fail('Unit prices must be non-negative and have at most 4 decimals.','أسعار الوحدات يجب ألا تكون سالبة وأن تحتوي أربع خانات عشرية كحد أقصى.');
  return normalized;
}
function parseQuantity(value:string):bigint{
  const normalized=normalizeDecimalInput(value.trim()||'0');
  if(!QUANTITY_PATTERN.test(normalized)||!isNonNegativeDecimalInput(normalized))
    fail('Invoice quantities must be non-negative with at most 4 decimals.','كميات الفاتورة يجب ألا تكون سالبة وبحد أقصى أربع خانات عشرية.');
  return scaled(normalized);
}
function parseTotal(value:string):string{
  const normalized=normalizeDecimalInput(value);
  if(!TOTAL_PATTERN.test(normalized)||!isNonNegativeDecimalInput(normalized))
    fail('Enter the actual invoice total with at most 2 decimal places.','أدخل إجمالي فاتورة المورد الحقيقي حتى خانتين عشريتين.');
  return normalized;
}

/** Three-way PO / physical receipt / vendor bill matching. Explicitly non-posting. */
export function matchSupplierInvoice(vault:VaultPayload,input:MatchSupplierInvoiceInput):
  {vault:VaultPayload;invoice:MatchedSupplierInvoice}{
  const actor=assertGovernancePermission(vault,'match-supplier-invoice');
  const order=vault.documents.find(doc=>doc.id===input.purchaseOrderId);
  if(!order||order.kind!=='purchase-order'||order.role!=='standard'||order.status!=='final'||order.lifecycleStatus==='voided')
    fail('Matching requires an active issued Purchase Order.','تتطلب المطابقة أمر شراء صادرًا وساريًا.');
  if(!input.expectedPurchaseOrderUpdatedAt||input.expectedPurchaseOrderUpdatedAt!==order.updatedAt)
    fail('Purchase Order changed. Reopen and review the latest copy.','تغير أمر الشراء. افتح النسخة الأحدث وراجعها.');
  if(Object.keys(validateDocument(order)).length)
    fail('Purchase Order is invalid.','أمر الشراء غير صالح.');
  const supplierId=order.supplierSnapshot?.sourceSupplierId||'';
  if(!supplierId||!vault.suppliers.some(supplier=>supplier.id===supplierId))
    fail('A registered supplier is required.','يلزم مورد مسجل.');
  if(!/^[A-Z]{3}$/.test(order.currency))
    fail('The Purchase Order currency is invalid.','عملة أمر الشراء غير صالحة.');
  assertGoodsReceiptIntegrity(vault.documents,vault.documentEvents);
  const invoiceReference=parseReference(input.invoiceReference);
  const invoiceDate=input.invoiceDate.trim(),dueDate=input.dueDate.trim(),notes=(input.notes||'').trim();
  if(!isIsoDate(invoiceDate)||invoiceDate>todayIso()||invoiceDate<order.issueDate)
    fail('Invoice date cannot be after today or before PO issuance.','لا يمكن أن يسبق تاريخ الفاتورة إصدار أمر الشراء أو يكون في المستقبل.');
  if(!isIsoDate(dueDate)||dueDate<invoiceDate)
    fail('Invoice due date must be valid and no earlier than its issue date.','تاريخ استحقاق فاتورة المورد يجب ألا يسبق تاريخها.');
  if(notes.length>500||/[\u0000-\u001f]/.test(notes))
    fail('Supplier invoice notes are too long or invalid.','ملاحظات فاتورة المورد طويلة جدًا أو غير صالحة.');
  if(!Array.isArray(input.quantities)||!Array.isArray(input.unitPrices)
    ||input.quantities.length!==order.items.length||input.unitPrices.length!==order.items.length||!order.items.length)
    fail('All invoice lines must be reconciled against the ordered lines.','يجب مطابقة جميع بنود الفاتورة مع بنود أمر الشراء.');
  for(const document of vault.documents.filter(d=>d.kind==='purchase-order')){
    if(matchedSupplierInvoices(document.id,vault.documentEvents).some(invoice=>
      invoice.supplierId===supplierId&&invoice.invoiceReference.trim().toLowerCase()===invoiceReference.toLowerCase()))
      fail('This supplier invoice reference has already been matched.','تمت مطابقة رقم فاتورة المورد مسبقًا.');
  }
  const balances=supplierInvoiceLineBalances(order,vault.documentEvents);
  let totalCents=0n;
  const lines:SupplierInvoiceMatchedLine[]=[];
  for(let i=0;i<order.items.length;i++){
    const item=order.items[i],balance=balances[i];
    if(!item||!balance)fail('Purchase Order line is missing.','أحد بنود أمر الشراء مفقود.');
    const quantity=parseQuantity(input.quantities[i]??'');
    if(scaled(balance.availableToMatch)<0n)
      fail('Prior invoice matches exceed physical receipts.','المطابقات السابقة تجاوزت الكمية المستلمة.');
    if(quantity>scaled(balance.availableToMatch))
      fail('Invoice quantity exceeds goods physically received and not already billed.','كمية الفاتورة تتجاوز المستلم فعليًا غير المطابق لفواتير سابقة.');
    const unitPrice=parsePrice(input.unitPrices[i]??'');
    if(!validPrice(item.unitPrice)||scaled(unitPrice)!==scaled(item.unitPrice))
      fail('Supplier invoice unit price differs from the issued Purchase Order. Review the variance first.','سعر فاتورة المورد يختلف عن أمر الشراء الصادر. راجع فرق السعر أولًا.');
    if(quantity===0n)continue;
    const quantityText=fmt(quantity),amount=lineTotal(quantityText,unitPrice);
    totalCents+=decimalToScaled(amount,2);
    lines.push({purchaseOrderLineId:item.id,quantity:quantityText,unit:item.unit,unitPrice,lineTotal:amount});
  }
  if(!lines.length)fail('At least one received item must be invoiced.','يجب مطابقة كمية مستلمة لصنف واحد على الأقل.');
  const expectedTotal=parseTotal(input.statedTotal);
  const calculatedTotal=`${totalCents/100n}.${(totalCents%100n).toString().padStart(2,'0')}`;
  if(compareMoneyStrings(expectedTotal,calculatedTotal)!==0)
    fail('Supplier invoice total does not match agreed unit prices and received quantities; reconcile extra charges separately.','إجمالي فاتورة المورد لا يطابق الأسعار المعتمدة والكميات المستلمة؛ يجب تسوية الرسوم الإضافية بشكل منفصل.');
  const invoice:MatchedSupplierInvoice={
    purchaseOrderId:order.id,purchaseOrderNumber:order.number,purchaseOrderUpdatedAt:order.updatedAt,
    supplierId,currency:order.currency,invoiceReference,invoiceDate,dueDate,
    acceptedAt:new Date().toISOString(),reviewedByMemberId:actor.id,notes,total:calculatedTotal,lines
  };
  const event=createDocumentEvent(order,'audit',INVOICE_MARKER+JSON.stringify(invoice));
  return {vault:{...vault,documentEvents:[...vault.documentEvents,event]},invoice};
}

/** Cross-device reconciliation: reject double billing / ghost invoices before accepting a merged vault. */
export function assertSupplierInvoiceIntegrity(documents:LourexDocument[],events:DocumentEventRecord[]):void{
  const candidates=events.filter(event=>event.type==='audit'&&event.note.startsWith(INVOICE_MARKER));
  if(!candidates.length)return;
  const orders=new Map(documents.filter(doc=>doc.kind==='purchase-order').map(doc=>[doc.id,doc]));
  const references=new Set<string>();
  for(const orderId of new Set(candidates.map(event=>event.documentId))){
    const order=orders.get(orderId);
    if(!order)fail('Matched supplier invoice has a missing PO.','فاتورة المورد المطابقة لا ترتبط بأمر شراء موجود.');
    const matches=matchedSupplierInvoices(orderId,events);
    if(matches.length!==candidates.filter(event=>event.documentId===orderId).length)
      fail('Corrupted supplier invoice matching evidence detected.','اكتشفت بيانات غير صالحة في سجل مطابقة فواتير الموردين.');
    const lineMap=new Map(order.items.map(line=>[line.id,line]));
    for(const invoice of matches){
      if(invoice.purchaseOrderNumber!==order.number||invoice.supplierId!==order.supplierSnapshot?.sourceSupplierId
        ||invoice.currency!==order.currency||invoice.purchaseOrderUpdatedAt!==order.updatedAt)
        fail('Matched invoice source was modified. Review and restore the original PO.','تغير أمر الشراء المرتبط بفواتير مطابقة. راجع المصدر الأصلي.');
      const key=`${invoice.supplierId.toLowerCase()}:${invoice.invoiceReference.trim().toLowerCase()}`;
      if(references.has(key))fail('Duplicate supplier invoice after concurrent sync.','ظهرت فاتورة مورد مكررة بعد المزامنة.');
      references.add(key);
      const seen=new Set<string>();
      let cents=0n;
      for(const line of invoice.lines){
        const source=lineMap.get(line.purchaseOrderLineId);
        if(!source||source.unit!==line.unit||seen.has(line.purchaseOrderLineId)
          ||!validPrice(source.unitPrice)||scaled(line.unitPrice)!==scaled(source.unitPrice)
          ||compareMoneyStrings(line.lineTotal,lineTotal(line.quantity,line.unitPrice))!==0)
          fail('Matched invoice line differs from its approved Purchase Order.','أحد بنود الفاتورة المطابقة يختلف عن أمر الشراء.');
        seen.add(line.purchaseOrderLineId);
        cents+=decimalToScaled(line.lineTotal,2);
      }
      if(compareMoneyStrings(invoice.total,`${cents/100n}.${(cents%100n).toString().padStart(2,'0')}`)!==0)
        fail('Matched supplier invoice total is inconsistent.','إجمالي فاتورة المورد المطابقة غير متسق.');
    }
    if(supplierInvoiceLineBalances(order,events).some(row=>scaled(row.availableToMatch)<0n))
      fail('Concurrent supplier invoices exceed physically received unbilled goods.','فواتير المورد المتزامنة تجاوزت البضاعة المستلمة غير المفوترة.');
  }
}
