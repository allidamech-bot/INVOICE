import type { DocumentEventRecord, DocumentItem, FinancialAdjustments, LourexDocument, VaultPayload } from '../types.js';
import { assertGovernancePermission } from './governance.js';
import { commercialTrackingFromEvents, isQuoteLikeDocument, linkedInvoiceForCommercialDocument } from './commercial-flow.js';
import { createDocumentEvent } from './document-lifecycle.js';
import { validateDocument } from './documents.js';
import { calculateTotals, decimalToScaled, isNonNegativeDecimalInput } from './money.js';
import { isIsoDate, todayIso } from './id.js';
import { t } from './i18n.js';

const SALES_ORDER_MARKER='@lourex:sales-order:accepted:v1:';
const QTY_PATTERN=/^\d{1,15}(?:\.\d{1,4})?$/;
const PRICE_PATTERN=/^\d{1,15}(?:\.\d{1,4})?$/;

export interface SalesOrderLine{
  quotationLineId:string;
  descriptionEn:string;
  descriptionAr:string;
  quantity:string;
  unit:string;
  unitPrice:string;
}
export interface AcceptedSalesOrder{
  quotationId:string;
  quotationNumber:string;
  quotationUpdatedAt:string;
  salesOrderNumber:string;
  customerReference:string;
  customerId:string;
  currency:string;
  orderDate:string;
  requestedDeliveryDate:string;
  acceptedByMemberId:string;
  notes:string;
  grandTotal:string;
  adjustments:FinancialAdjustments;
  lines:SalesOrderLine[];
}
export interface AcceptSalesOrderInput{
  quotationId:string;
  expectedQuotationUpdatedAt:string;
  customerReference:string;
  orderDate:string;
  requestedDeliveryDate:string;
  notes?:string;
}

function fail(en:string,ar:string):never{throw new Error(t(en,ar));}
function digits(raw:string):boolean{return QTY_PATTERN.test(raw)&&isNonNegativeDecimalInput(raw)&&decimalToScaled(raw,4)>0n;}
function price(raw:string):boolean{return PRICE_PATTERN.test(raw)&&isNonNegativeDecimalInput(raw);}
function quoteLineSnapshot(line:DocumentItem):SalesOrderLine{
  return{quotationLineId:line.id,descriptionEn:line.descriptionEn,descriptionAr:line.descriptionAr,
    quantity:line.quantity,unit:line.unit,unitPrice:line.unitPrice};
}
function sameLines(order:AcceptedSalesOrder,quote:LourexDocument):boolean{
  return order.lines.length===quote.items.length&&order.lines.every((line,i)=>{
    const item=quote.items[i];
    return Boolean(item&&line.quotationLineId===item.id&&line.descriptionEn===item.descriptionEn
      &&line.descriptionAr===item.descriptionAr&&line.unit===item.unit
      &&digits(line.quantity)&&digits(item.quantity)&&price(line.unitPrice)&&price(item.unitPrice)
      &&decimalToScaled(line.quantity,4)===decimalToScaled(item.quantity,4)
      &&decimalToScaled(line.unitPrice,4)===decimalToScaled(item.unitPrice,4));
  });
}
export function acceptedSalesOrders(quotationId:string,events:DocumentEventRecord[]):AcceptedSalesOrder[]{
  return events.filter(event=>event.documentId===quotationId&&event.type==='audit'&&event.note.startsWith(SALES_ORDER_MARKER))
    .flatMap(event=>{
      try{
        const order=JSON.parse(event.note.slice(SALES_ORDER_MARKER.length)) as AcceptedSalesOrder;
        if(!order||order.quotationId!==quotationId||!order.salesOrderNumber||!order.customerId
          ||!isIsoDate(order.orderDate)||!isIsoDate(order.requestedDeliveryDate)
          ||!Array.isArray(order.lines)||!order.lines.length||!order.adjustments
          ||order.lines.some(line=>!line||!line.quotationLineId||!line.unit||!digits(line.quantity)||!price(line.unitPrice)))return[];
        return [order];
      }catch{return[];}
    });
}
export function salesOrderForQuotation(quotationId:string,events:DocumentEventRecord[]):AcceptedSalesOrder|undefined{
  return acceptedSalesOrders(quotationId,events)[0];
}
/** Snapshot a customer-accepted quotation as an immutable operational sales order.
 * Nothing is shipped, billed, collected or posted by recording an SO.
 */
export function acceptSalesOrder(vault:VaultPayload,input:AcceptSalesOrderInput):
  {vault:VaultPayload;order:AcceptedSalesOrder}{
  const actor=assertGovernancePermission(vault,'accept-sales-order');
  const quote=vault.documents.find(doc=>doc.id===input.quotationId);
  if(!quote||!isQuoteLikeDocument(quote)||quote.status!=='final'||quote.lifecycleStatus==='voided')
    fail('An active issued quotation is required to create a Sales Order.','يلزم عرض سعر صادر وسارٍ لإنشاء أمر بيع.');
  if(!input.expectedQuotationUpdatedAt||quote.updatedAt!==input.expectedQuotationUpdatedAt)
    fail('Quotation has changed. Reopen the latest version.','تغير عرض السعر. افتح أحدث نسخة.');
  if(Object.keys(validateDocument(quote)).length)
    fail('Quotation is invalid; correct it before acceptance.','عرض السعر غير صالح. صححه قبل الاعتماد.');
  if(linkedInvoiceForCommercialDocument(quote,vault.documents))
    fail('This quotation has already been converted to a sales invoice.','تحول عرض السعر مسبقًا إلى فاتورة مبيعات.');
  const status=commercialTrackingFromEvents(quote.id,vault.documentEvents);
  if(status.status!=='accepted')
    fail('Record customer acceptance of this quotation before creating a Sales Order.','سجّل قبول العميل لعرض السعر قبل إنشاء أمر البيع.');
  if(acceptedSalesOrders(quote.id,vault.documentEvents).length)
    fail('This quotation already has an accepted Sales Order.','يوجد أمر بيع معتمد لهذا العرض مسبقًا.');
  const customerId=quote.customerSnapshot?.sourceCustomerId?.trim()||'';
  if(!customerId||!vault.customers.some(customer=>customer.id===customerId))
    fail('The Sales Order requires a registered customer.','يلزم عميل مسجل لأمر البيع.');
  const customerReference=input.customerReference.trim(),notes=(input.notes||'').trim();
  if(customerReference.length>100||/[\u0000-\u001f]/.test(customerReference))
    fail('Customer order reference must be at most 100 characters.','مرجع طلب العميل يجب ألا يتجاوز 100 حرف.');
  if(notes.length>500||/[\u0000-\u001f]/.test(notes))
    fail('Sales Order notes are too long or invalid.','ملاحظات أمر البيع طويلة أو غير صالحة.');
  const orderDate=input.orderDate.trim(),requestedDeliveryDate=input.requestedDeliveryDate.trim();
  if(!isIsoDate(orderDate)||orderDate<quote.issueDate||orderDate>todayIso())
    fail('Sales Order date must be valid, after quote issuance, and not in the future.','تاريخ أمر البيع يجب أن يكون صالحًا وألا يسبق العرض أو يقع بالمستقبل.');
  if(!isIsoDate(requestedDeliveryDate)||requestedDeliveryDate<orderDate)
    fail('Requested delivery date must be on or after the Sales Order date.','موعد التسليم المطلوب يجب ألا يسبق تاريخ أمر البيع.');
  if(!/^[A-Z]{3}$/.test(quote.currency)||!quote.items.length
    ||quote.items.some(line=>!digits(line.quantity)||!price(line.unitPrice)||!line.unit.trim()))
    fail('Quotation items, quantities or prices are invalid.','بنود عرض السعر أو كمياته أو أسعاره غير صالحة.');
  const grandTotal=calculateTotals(quote.items,quote.adjustments).grandTotal;
  const order:AcceptedSalesOrder={
    quotationId:quote.id,quotationNumber:quote.number,quotationUpdatedAt:quote.updatedAt,
    salesOrderNumber:`SO-${quote.number}`,customerReference,customerId,currency:quote.currency,
    orderDate,requestedDeliveryDate,acceptedByMemberId:actor.id,notes,grandTotal,
    adjustments:structuredClone(quote.adjustments),lines:quote.items.map(quoteLineSnapshot)
  };
  const event=createDocumentEvent(quote,'audit',SALES_ORDER_MARKER+JSON.stringify(order));
  const next={...vault,documentEvents:[...vault.documentEvents,event]};
  assertSalesOrderIntegrity(next.documents,next.documentEvents);
  return{vault:next,order};
}

/** Fail closed when two offline devices independently accept a quote, or the
 * original accepted quotation is revised/repriced/deleted after commitment.
 */
export function assertSalesOrderIntegrity(documents:LourexDocument[],events:DocumentEventRecord[]):void{
  const candidates=events.filter(event=>event.type==='audit'&&event.note.startsWith(SALES_ORDER_MARKER));
  if(!candidates.length)return;
  const docs=new Map(documents.map(doc=>[doc.id,doc]));
  const numbers=new Set<string>();
  const seenQuotation=new Set<string>();
  for(const event of candidates){
    const source=docs.get(event.documentId);
    const list=acceptedSalesOrders(event.documentId,[event]);
    if(list.length!==1)
      fail('Sales Order acceptance evidence is corrupted.','سجل قبول أمر البيع غير صالح.');
    const order=list[0]!;
    if(seenQuotation.has(order.quotationId))
      fail('Concurrent Sales Orders conflict for one quotation.','تعارض أمرَي بيع لنفس عرض السعر عند المزامنة.');
    seenQuotation.add(order.quotationId);
    const normalizedNumber=order.salesOrderNumber.trim().toLowerCase();
    if(numbers.has(normalizedNumber))
      fail('Duplicate Sales Order numbers exist after sync.','أرقام أوامر البيع مكررة بعد المزامنة.');
    numbers.add(normalizedNumber);
    if(!source||!isQuoteLikeDocument(source)||source.status!=='final'||source.lifecycleStatus==='voided'
      ||source.number!==order.quotationNumber||source.updatedAt!==order.quotationUpdatedAt
      ||source.customerSnapshot?.sourceCustomerId!==order.customerId||source.currency!==order.currency
      ||order.salesOrderNumber!==`SO-${source.number}`)
      fail('Sales Order source quotation changed or is missing.','عرض السعر الأصلي لأمر البيع تغير أو لم يعد موجودًا.');
    if(!isIsoDate(order.orderDate)||order.orderDate<source.issueDate||!isIsoDate(order.requestedDeliveryDate)
      ||order.requestedDeliveryDate<order.orderDate)
      fail('Sales Order has invalid dates.','تواريخ أمر البيع غير صالحة.');
    if(!sameLines(order,source)||JSON.stringify(order.adjustments)!==JSON.stringify(source.adjustments)
      ||order.grandTotal!==calculateTotals(source.items,source.adjustments).grandTotal)
      fail('Sales Order price, quantity or commercial adjustments differ from accepted quotation.','أسعار أو كميات أو تعديلات أمر البيع تختلف عن عرض السعر المقبول.');
    if(commercialTrackingFromEvents(source.id,events).status!=='accepted')
      fail('Sales Order has no recorded customer quotation acceptance.','أمر البيع يفتقد إثبات قبول العميل لعرض السعر.');
  }
}
