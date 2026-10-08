import type { DocumentEventRecord, LourexDocument, VaultPayload } from '../types.js';
import { assertGovernancePermission } from './governance.js';
import { createDocumentEvent } from './document-lifecycle.js';
import { validateDocument } from './documents.js';
import { confirmedGoodsReceipts, goodsReceiptBalances } from './goods-receipt-flow.js';
import { decimalToScaled, isNonNegativeDecimalInput, lineTotal, normalizeDecimalInput } from './money.js';
import { isIsoDate, todayIso } from './id.js';
import { t } from './i18n.js';

const INVOICE_MARKER='@lourex:supplier-invoice:three-way-matched:v1:';
const QTY_SCALE=10_000n;
const NUMBER_PATTERN=/^\d{1,15}(?:\.\d{1,4})?$/;
const PRICE_PATTERN=/^\d{1,18}(?:\.\d{1,4})?$/;

export interface SupplierInvoiceMatchedLine {
  purchaseOrderLineId:string;
  quantity:string;
  unit:string;
  unitPrice:string;
}
export interface MatchedSupplierInvoice{
  purchaseOrderId:string;
  purchaseOrderNumber:string;
  purchaseOrderUpdatedAt:string;
  reference:string;
  invoiceDate:string;
  supplierId:string;
  currency:string;
  reviewedByMemberId:string;
  lineSubtotal:string;
  notes:string;
  lines:SupplierInvoiceMatchedLine[];
}
export interface MatchSupplierInvoiceInput{
  purchaseOrderId:string;
  expectedPurchaseOrderUpdatedAt:string;
  reference:string;
  invoiceDate:string;
  quantities:string[];
  unitPrices:string[];
  notes?:string;
}
export interface SupplierInvoiceLineBalance{
  purchaseOrderLineId:string;
  ordered:string;
  received:string;
  billed:string;
  availableToBill:string;
  unitPrice:string;
}

function fail(en:string,ar:string):never{throw new Error(t(en,ar));}
function q(value:string):bigint{return decimalToScaled(value,4);}
function qty(value:bigint):string{
  const sign=value<0n?'-':'',abs=value<0n?-value:value;
  return `${sign}${abs/QTY_SCALE}.${(abs%QTY_SCALE).toString().padStart(4,'0')}`.replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
}
function centsString(cents:bigint):string{
  const sign=cents<0n?'-':'',abs=cents<0n?-cents:cents;
  return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;
}
function validInvoiceRow(row:MatchedSupplierInvoice):boolean{
  return Boolean(row&&typeof row.purchaseOrderId==='string'&&row.purchaseOrderId
    &&typeof row.purchaseOrderNumber==='string'&&row.purchaseOrderNumber
    &&typeof row.supplierId==='string'&&row.supplierId
    &&typeof row.currency==='string'&&row.currency
    &&typeof row.reference==='string'&&row.reference
    &&typeof row.lineSubtotal==='string'&&/^\d+\.\d{2}$/.test(row.lineSubtotal)
    &&isIsoDate(row.invoiceDate)&&Array.isArray(row.lines)&&row.lines.length
    &&row.lines.every(line=>line&&typeof line.purchaseOrderLineId==='string'&&line.purchaseOrderLineId
      &&typeof line.quantity==='string'&&NUMBER_PATTERN.test(line.quantity)&&q(line.quantity)>0n
      &&typeof line.unit==='string'&&line.unit
      &&typeof line.unitPrice==='string'&&PRICE_PATTERN.test(line.unitPrice)));
}
export function isMatchedSupplierInvoiceEvent(event:DocumentEventRecord):boolean{
  return event.type==='audit'&&event.note.startsWith(INVOICE_MARKER);
}
export function matchedSupplierInvoices(purchaseOrderId:string,events:DocumentEventRecord[]):MatchedSupplierInvoice[]{
  return events.filter(event=>event.documentId===purchaseOrderId&&isMatchedSupplierInvoiceEvent(event)).flatMap(event=>{
    try{
      const data=JSON.parse(event.note.slice(INVOICE_MARKER.length)) as MatchedSupplierInvoice;
      return data.purchaseOrderId===purchaseOrderId&&validInvoiceRow(data)?[data]:[];
    }catch{return[];}
  });
}

export function supplierInvoiceLineBalances(order:LourexDocument,events:DocumentEventRecord[]):SupplierInvoiceLineBalance[]{
  const grn=goodsReceiptBalances(order,events);
  const bills=matchedSupplierInvoices(order.id,events);
  return order.items.map((line,i)=>{
    const billed=bills.reduce((sum,bill)=>sum+bill.lines.reduce((part,row)=>
      part+(row.purchaseOrderLineId===line.id?q(row.quantity):0n),0n),0n);
    const received=q(grn[i]?.received||'0');
    return {
      purchaseOrderLineId:line.id,ordered:qty(q(line.quantity)),received:qty(received),
      billed:qty(billed),availableToBill:qty(received-billed),unitPrice:line.unitPrice
    };
  });
}

/** Human-reviewed, immutable PO/GRN/supplier-invoice matching evidence only.
 * Does not create a PurchaseRecord, payable, payment, or stock movement.
 */
export function matchSupplierInvoice(vault:VaultPayload,input:MatchSupplierInvoiceInput):
  {vault:VaultPayload;invoice:MatchedSupplierInvoice}{
  const actor=assertGovernancePermission(vault,'match-supplier-invoice');
  const order=vault.documents.find(doc=>doc.id===input.purchaseOrderId);
  if(!order||order.kind!=='purchase-order'||order.role!=='standard'||order.status!=='final'
    ||order.lifecycleStatus==='voided')fail('Matching requires an active issued Purchase Order.','تتطلب المطابقة أمر شراء صادرًا وساريًا.');
  if(!input.expectedPurchaseOrderUpdatedAt||order.updatedAt!==input.expectedPurchaseOrderUpdatedAt)
    fail('Purchase Order changed. Reopen its latest version.','تغير أمر الشراء. افتح النسخة الحديثة.');
  if(Object.keys(validateDocument(order)).length)
    fail('Correct the invalid Purchase Order before matching the supplier invoice.','صحح أمر الشراء غير الصالح قبل مطابقة فاتورة المورد.');
  const supplierId=order.supplierSnapshot?.sourceSupplierId?.trim()||'';
  if(!supplierId||!vault.suppliers.some(supplier=>supplier.id===supplierId))
    fail('The Purchase Order must refer to a registered supplier.','يجب ربط أمر الشراء بمورد مسجل.');
  if(!/^[A-Z]{3}$/.test(order.currency))
    fail('The Purchase Order currency is invalid.','عملة أمر الشراء غير صالحة.');
  const reference=input.reference.trim(),invoiceDate=input.invoiceDate.trim(),notes=(input.notes||'').trim();
  if(!reference||reference.length>100||/[\u0000-\u001f]/.test(reference))
    fail('Supplier invoice reference is required (maximum 100 characters).','مرجع فاتورة المورد مطلوب، بحد أقصى 100 حرف.');
  if(!isIsoDate(invoiceDate)||invoiceDate<order.issueDate||invoiceDate>todayIso())
    fail('Supplier invoice date must be valid, after the order and no later than today.','تاريخ فاتورة المورد يجب أن يكون صالحًا، بعد أمر الشراء ولا يتجاوز اليوم.');
  if(notes.length>500||/[\u0000-\u001f]/.test(notes))
    fail('Supplier invoice notes are too long or invalid.','ملاحظات فاتورة المورد طويلة جدًا أو غير صالحة.');
  if(!Array.isArray(input.quantities)||!Array.isArray(input.unitPrices)
    ||input.quantities.length!==order.items.length||input.unitPrices.length!==order.items.length||!order.items.length)
    fail('The invoice must cover the exact Purchase Order line structure.','يجب أن تتطابق بنود الفاتورة مع بنود أمر الشراء.');
  // Across all purchase orders for one supplier, a real invoice reference is unique.
  for(const doc of vault.documents){
    if(doc.kind!=='purchase-order')continue;
    if(matchedSupplierInvoices(doc.id,vault.documentEvents).some(bill=>
      bill.supplierId===supplierId&&bill.reference.trim().toLowerCase()===reference.toLowerCase())){
      fail('This supplier invoice reference is already matched.','مرجع فاتورة المورد هذا مطابق مسبقًا.');
    }
  }
  const grns=confirmedGoodsReceipts(order.id,vault.documentEvents);
  if(!grns.length)fail('Record actual goods receipt (GRN) before matching an invoice.','سجل استلام البضاعة GRN قبل مطابقة فاتورة المورد.');
  const balances=supplierInvoiceLineBalances(order,vault.documentEvents);
  const amounts=input.quantities.map((raw,index)=>{
    const value=normalizeDecimalInput(raw.trim()||'0');
    if(!isNonNegativeDecimalInput(value)||!NUMBER_PATTERN.test(value))
      fail('Invoice quantities must be non-negative with up to four decimal places.','كميات الفاتورة يجب أن تكون غير سالبة وبحد أقصى أربع منازل عشرية.');
    const available=balances[index];
    if(!available)fail('Missing Purchase Order line.','أحد بنود أمر الشراء مفقود.');
    if(q(available.availableToBill)<0n)fail('Previous invoice matches conflict with the receipts.','مطابقات الفواتير السابقة تتعارض مع الاستلامات.');
    const requested=q(value);
    if(requested>q(available.availableToBill))
      fail('Invoice quantity exceeds received and not-yet-invoiced goods.','كمية الفاتورة تتجاوز البضاعة المستلمة وغير المفوترة.');
    return requested;
  });
  if(!amounts.some(amount=>amount>0n))
    fail('At least one invoice line needs a positive quantity.','يجب أن تحتوي الفاتورة على كمية موجبة لصنف واحد على الأقل.');
  const prices=input.unitPrices.map((raw,index)=>{
    const value=normalizeDecimalInput(raw.trim());
    const expected=order.items[index]?.unitPrice||'';
    if(!isNonNegativeDecimalInput(value)||!PRICE_PATTERN.test(value)
      ||!PRICE_PATTERN.test(expected)||decimalToScaled(value,4)!==decimalToScaled(expected,4)){
      fail('Supplier invoice unit price must exactly match the approved Purchase Order price.','يجب أن يطابق سعر الوحدة في فاتورة المورد السعر المعتمد في أمر الشراء بالضبط.');
    }
    return value;
  });
  const lines:SupplierInvoiceMatchedLine[]=order.items.flatMap((item,index)=>{
    const quantity=amounts[index]??0n;
    if(quantity<=0n)return[];
    const price=prices[index];
    if(price===undefined)fail('Missing supplier invoice price.','سعر فاتورة المورد مفقود.');
    return [{purchaseOrderLineId:item.id,quantity:qty(quantity),unit:item.unit,unitPrice:price}];
  });
  const lineSubtotal=centsString(lines.reduce((sum,line)=>sum+decimalToScaled(lineTotal(line.quantity,line.unitPrice),2),0n));
  const invoice:MatchedSupplierInvoice={
    purchaseOrderId:order.id,purchaseOrderNumber:order.number,purchaseOrderUpdatedAt:order.updatedAt,
    reference,invoiceDate,supplierId,currency:order.currency,reviewedByMemberId:actor.id,
    lineSubtotal,notes,lines
  };
  const event=createDocumentEvent(order,'audit',INVOICE_MARKER+JSON.stringify(invoice));
  const result={vault:{...vault,documentEvents:[...vault.documentEvents,event]},invoice};
  assertSupplierInvoiceMatchIntegrity(result.vault.documents,result.vault.documentEvents);
  return result;
}

/** Verify all matched invoices after merging offline work from multiple devices. */
export function assertSupplierInvoiceMatchIntegrity(documents:LourexDocument[],events:DocumentEventRecord[]):void{
  const sourceEvents=events.filter(isMatchedSupplierInvoiceEvent);
  if(!sourceEvents.length)return;
  const orders=new Map(documents.filter(doc=>doc.kind==='purchase-order').map(doc=>[doc.id,doc]));
  const supplierReferences=new Set<string>();
  const affected=new Set(sourceEvents.map(e=>e.documentId));
  for(const poId of affected){
    const order=orders.get(poId);
    if(!order)fail('A Purchase Order with a matched supplier invoice was deleted.','حُذف أمر شراء مرتبط بفاتورة مورد مطابقة.');
    const stored=sourceEvents.filter(event=>event.documentId===poId);
    const bills=matchedSupplierInvoices(poId,events);
    if(stored.length!==bills.length)
      fail('A matched supplier invoice has invalid or damaged evidence.','هناك بيانات تالفة أو غير صالحة لمطابقة فاتورة المورد.');
    const allowed=new Map(order.items.map(item=>[item.id,item]));
    const received=goodsReceiptBalances(order,events);
    const receivedMap=new Map(received.map(row=>[row.purchaseOrderLineId,q(row.received)]));
    const billed=new Map<string,bigint>();
    for(const bill of bills){
      if(bill.purchaseOrderNumber!==order.number||bill.supplierId!==order.supplierSnapshot?.sourceSupplierId||bill.currency!==order.currency)
        fail('Supplier invoice identity or currency conflicts with the Purchase Order.','تتعارض هوية فاتورة المورد أو عملتها مع أمر الشراء.');
      const refKey=JSON.stringify([bill.supplierId,bill.reference.trim().toLowerCase()]);
      if(supplierReferences.has(refKey))
        fail('Duplicate supplier invoice reference found during sync.','مرجع فاتورة المورد مكرر أثناء المزامنة.');
      supplierReferences.add(refKey);
      let calculated=0n;
      const ids=new Set<string>();
      for(const row of bill.lines){
        const source=allowed.get(row.purchaseOrderLineId);
        if(!source||ids.has(row.purchaseOrderLineId)||row.unit!==source.unit
          ||!PRICE_PATTERN.test(source.unitPrice)||decimalToScaled(row.unitPrice,4)!==decimalToScaled(source.unitPrice,4))
          fail('Supplier invoice line or price conflicts with the Purchase Order.','تختلف بيانات بند فاتورة المورد أو سعره عن أمر الشراء.');
        ids.add(row.purchaseOrderLineId);
        billed.set(row.purchaseOrderLineId,(billed.get(row.purchaseOrderLineId)||0n)+q(row.quantity));
        calculated+=decimalToScaled(lineTotal(row.quantity,row.unitPrice),2);
      }
      if(centsString(calculated)!==bill.lineSubtotal)
        fail('Matched supplier invoice line subtotal is inconsistent.','مجموع بنود فاتورة المورد غير متطابق.');
    }
    for(const [lineId,amount] of billed){
      if(amount>(receivedMap.get(lineId)||0n))
        fail('Concurrent supplier invoices exceed received quantities. Reconcile before syncing.','تتجاوز فواتير المورد المتزامنة الكميات المستلمة. راجعها قبل المزامنة.');
    }
  }
}
