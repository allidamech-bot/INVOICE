import type {DocumentEventRecord, LourexDocument, VaultPayload} from '../types.js';
import {convertToInvoice, nextDocumentNumber, validateDocument} from './documents.js';
import {createDocumentEvent} from './document-lifecycle.js';
import {makeId} from './id.js';
import {assertGovernancePermission} from './governance.js';
import {decimalToScaled} from './money.js';
import {t} from './i18n.js';
import {
  assertSalesDeliveryIntegrity, confirmedSalesDeliveries, deliverySalesOrderContext
} from './sales-delivery-flow.js';

const LINK_MARKER='@lourex:sales-order:delivery-invoice:v1:';
interface InvoiceLineEvidence {
  salesOrderLineId:string;
  invoiceLineId:string;
  deliveryLineId:string;
  quantity:string;
}
interface InvoiceDeliveryEvidence {
  invoiceId:string;
  invoiceNumber:string;
  quotationId:string;
  salesOrderNumber:string;
  deliveryNoteId:string;
  deliveryNoteUpdatedAt:string;
  deliveryReference:string;
  customerId:string;
  currency:string;
  lines:InvoiceLineEvidence[];
}
function fail(en:string,ar:string):never{throw new Error(t(en,ar));}
function scaled(raw:string):bigint{return decimalToScaled(raw,4);}
function links(events:DocumentEventRecord[]):DocumentEventRecord[]{
  return events.filter(event=>event.type==='created'&&event.note.startsWith(LINK_MARKER));
}
function parseLink(event:DocumentEventRecord):InvoiceDeliveryEvidence|null{
  try{
    const value=JSON.parse(event.note.slice(LINK_MARKER.length)) as InvoiceDeliveryEvidence;
    if(!value||value.invoiceId!==event.documentId||value.deliveryNoteId!==event.relatedDocumentId
      ||!value.invoiceNumber||!value.quotationId||!value.salesOrderNumber||!value.deliveryNoteUpdatedAt
      ||!value.deliveryReference||!value.customerId||!value.currency
      ||!Array.isArray(value.lines)||!value.lines.length||value.lines.some(line=>!line||
        !line.salesOrderLineId||!line.invoiceLineId||!line.deliveryLineId||!line.quantity))return null;
    return value;
  }catch{return null;}
}
export function isDeliveryLinkedInvoice(invoiceId:string,events:DocumentEventRecord[]):boolean{
  return links(events).some(event=>event.documentId===invoiceId);
}
export function invoiceSourceDelivery(invoiceId:string,documents:LourexDocument[],events:DocumentEventRecord[]):LourexDocument|undefined{
  const event=links(events).find(item=>item.documentId===invoiceId);
  if(!event)return undefined;
  const record=parseLink(event);
  if(!record)fail('Invoice delivery source is invalid.','مرجع سند تسليم الفاتورة غير صالح.');
  return documents.find(doc=>doc.id===record.deliveryNoteId);
}
export function linkedDeliveryInvoice(deliveryNoteId:string,documents:LourexDocument[],events:DocumentEventRecord[]):LourexDocument|undefined{
  const matches=links(events).filter(event=>event.relatedDocumentId===deliveryNoteId);
  if(!matches.length)return undefined;
  if(matches.length!==1)fail('Competing invoices exist for this confirmed delivery. Reconcile before continuing.','توجد فواتير متعارضة لنفس التسليم المؤكد. راجعها قبل المتابعة.');
  const record=parseLink(matches[0]!);
  if(!record)fail('Delivery invoice evidence is corrupted.','سجل ربط فاتورة التسليم غير صالح.');
  const invoice=documents.find(doc=>doc.id===record.invoiceId);
  if(!invoice)fail('The linked delivery invoice is missing.','الفاتورة المرتبطة بالتسليم مفقودة.');
  return invoice;
}
/** Only creates a reviewable draft. No invoice issue, stock movement, receipt or posting. */
export function createConfirmedDeliveryInvoiceDraft(vault:VaultPayload,deliveryNoteId:string):
  {vault:VaultPayload;invoice:LourexDocument;created:boolean}{
  assertSalesDeliveryIntegrity(vault.documents,vault.documentEvents);
  assertDeliveryInvoiceIntegrity(vault.documents,vault.documentEvents);
  const delivery=vault.documents.find(doc=>doc.id===deliveryNoteId);
  if(!delivery||delivery.kind!=='delivery-note'||delivery.role!=='standard'
    ||delivery.status!=='final'||delivery.lifecycleStatus==='voided')
    fail('An active issued Delivery Note is required.','يلزم سند تسليم صادر وسارٍ.');
  const proofs=confirmedSalesDeliveries(delivery.id,vault.documentEvents);
  if(proofs.length!==1)
    fail('Confirm actual delivery quantities before preparing an invoice.','أكد الكميات المسلّمة فعليًا قبل تجهيز الفاتورة.');
  assertGovernancePermission(vault,'issue-document');
  const existing=linkedDeliveryInvoice(delivery.id,vault.documents,vault.documentEvents);
  if(existing)return{vault,invoice:existing,created:false};
  const proof=proofs[0]!,context=deliverySalesOrderContext(delivery,vault.documents,vault.documentEvents);
  if(!context)fail('Accepted Sales Order source is unavailable.','مصدر أمر البيع المعتمد غير متاح.');
  const {order,quotation}=context;
  if(proof.quotationId!==order.quotationId||proof.salesOrderNumber!==order.salesOrderNumber
    ||proof.customerId!==quotation.customerSnapshot?.sourceCustomerId||proof.currency!==quotation.currency)
    fail('Customer or currency differs from accepted Sales Order.','هوية العميل أو العملة تختلف عن أمر البيع المعتمد.');
  if(Object.keys(validateDocument(quotation)).length)
    fail('Accepted quotation must remain valid.','يجب أن يبقى عرض السعر المقبول صالحًا.');
  const acceptedLines=new Map(order.lines.map(line=>[line.quotationLineId,line]));
  const quoteLines=new Map(quotation.items.map(line=>[line.id,line]));
  const seen=new Set<string>();
  const invoiceLines=proof.lines.map(line=>{
    const accepted=acceptedLines.get(line.salesOrderLineId),source=quoteLines.get(line.salesOrderLineId);
    if(!accepted||!source||seen.has(line.salesOrderLineId)||line.unit!==accepted.unit
      ||scaled(line.quantity)<=0n||scaled(line.quantity)>scaled(accepted.quantity))
      fail('Confirmed delivery lines differ from accepted Sales Order.','بنود التسليم المؤكد تختلف عن أمر البيع المعتمد.');
    seen.add(line.salesOrderLineId);
    return{...source,id:makeId('item'),quantity:line.quantity};
  });
  const numbered=nextDocumentNumber(vault,'invoice');
  const base=convertToInvoice(quotation,numbered.number);
  const reference=quotation.language==='ar'
    ?'فاتورة مقابل سند التسليم المؤكد '+delivery.number+' ('+proof.reference+')'
    :quotation.language==='bilingual'
      ?'Invoice for confirmed Delivery Note '+delivery.number+' ('+proof.reference+') / فاتورة مقابل سند التسليم المؤكد'
      :'Invoice for confirmed Delivery Note '+delivery.number+' ('+proof.reference+')';
  const invoice:LourexDocument={...base,items:invoiceLines,
    // Full-order overhead costs are not automatically copied into every partial invoice.
    internalCosts:{shippingCost:'0.00',otherCost:'0.00'},
    adjustments:{...base.adjustments,discountEnabled:false,discountMode:'fixed',discountValue:'0.00',
      shippingEnabled:false,shipping:'0.00',otherChargesEnabled:false,otherCharges:'0.00'},
    terms:{...base.terms,remarks:[base.terms.remarks,reference].filter(Boolean).join('\n')}};
  const evidence:InvoiceDeliveryEvidence={
    invoiceId:invoice.id,invoiceNumber:invoice.number,quotationId:quotation.id,
    salesOrderNumber:order.salesOrderNumber,deliveryNoteId:delivery.id,
    deliveryNoteUpdatedAt:delivery.updatedAt,deliveryReference:proof.reference,
    customerId:proof.customerId,currency:proof.currency,
    lines:proof.lines.map((line,i)=>({
      salesOrderLineId:line.salesOrderLineId,invoiceLineId:invoiceLines[i]!.id,
      deliveryLineId:line.deliveryLineId,quantity:line.quantity
    }))
  };
  const documentEvents=[...vault.documentEvents,
    createDocumentEvent(invoice,'created',LINK_MARKER+JSON.stringify(evidence),delivery)];
  const next={...numbered.vault,documents:[...vault.documents,invoice],documentEvents};
  assertDeliveryInvoiceIntegrity(next.documents,next.documentEvents);
  return{vault:next,invoice,created:true};
}
/** Cross-device sync invariant: one immutable exact-quantity invoice per confirmed DN. */
export function assertDeliveryInvoiceIntegrity(documents:LourexDocument[],events:DocumentEventRecord[]):void{
  const records=links(events);
  if(!records.length)return;
  assertSalesDeliveryIntegrity(documents,events);
  const docs=new Map(documents.map(doc=>[doc.id,doc]));
  const seenDeliveries=new Set<string>(),seenInvoices=new Set<string>();
  for(const event of records){
    const record=parseLink(event);
    if(!record)fail('Delivery invoice link evidence is invalid.','سجل ربط فاتورة التسليم غير صالح.');
    const invoice=docs.get(record.invoiceId),delivery=docs.get(record.deliveryNoteId);
    if(seenDeliveries.has(record.deliveryNoteId)||seenInvoices.has(record.invoiceId))
      fail('Concurrent invoices conflict for one delivered shipment.','تعارضت الفواتير المتزامنة لنفس الشحنة المسلّمة.');
    seenDeliveries.add(record.deliveryNoteId);seenInvoices.add(record.invoiceId);
    if(!invoice||invoice.kind!=='invoice'||invoice.role!=='standard'
      ||invoice.number!==record.invoiceNumber||invoice.convertedFromId!==record.quotationId
      ||invoice.customerSnapshot?.sourceCustomerId!==record.customerId
      ||invoice.currency!==record.currency||invoice.items.length!==record.lines.length
      ||documents.some(other=>other.id!==invoice.id&&other.number.trim().toLowerCase()===invoice.number.trim().toLowerCase()))
      fail('Delivery invoice source, customer or line count changed.','تغير مصدر فاتورة التسليم أو العميل أو عدد البنود.');
    if(!delivery||delivery.kind!=='delivery-note'||delivery.updatedAt!==record.deliveryNoteUpdatedAt
      ||delivery.status!=='final'||delivery.lifecycleStatus==='voided')
      fail('Issued Delivery Note source has changed.','تغير سند التسليم الصادر المرتبط بالفاتورة.');
    const proof=confirmedSalesDeliveries(delivery.id,events);
    const context=deliverySalesOrderContext(delivery,documents,events);
    if(proof.length!==1||!context||proof[0]!.reference!==record.deliveryReference
      ||proof[0]!.quotationId!==record.quotationId||context.order.salesOrderNumber!==record.salesOrderNumber)
      fail('Invoice has no matching physical-delivery evidence.','الفاتورة تفتقد إثبات تسليم فعلي مطابق.');
    if(record.lines.length!==proof[0]!.lines.length)
      fail('Invoice must include every confirmed delivery line.','يجب أن تشمل الفاتورة جميع بنود التسليم المؤكد.');
    const orderLines=new Map(context.order.lines.map(line=>[line.quotationLineId,line]));
    const mapped=new Map(proof[0]!.lines.map(line=>[line.salesOrderLineId,line]));
    const seenLines=new Set<string>();
    for(let i=0;i<record.lines.length;i++){
      const ref=record.lines[i]!,item=invoice.items[i],accepted=orderLines.get(ref.salesOrderLineId);
      const confirmed=mapped.get(ref.salesOrderLineId);
      if(!item||!accepted||!confirmed||seenLines.has(ref.salesOrderLineId)
        ||item.id!==ref.invoiceLineId||confirmed.deliveryLineId!==ref.deliveryLineId
        ||scaled(ref.quantity)!==scaled(confirmed.quantity)
        ||scaled(item.quantity)!==scaled(confirmed.quantity)
        ||item.unit!==accepted.unit||item.descriptionEn!==accepted.descriptionEn
        ||item.descriptionAr!==accepted.descriptionAr
        ||scaled(item.unitPrice)!==scaled(accepted.unitPrice))
        fail('Invoice quantities, products or prices differ from confirmed delivery / accepted order.','كميات أو أصناف أو أسعار الفاتورة تختلف عن التسليم المؤكد وأمر البيع المعتمد.');
      seenLines.add(ref.salesOrderLineId);
    }
  }
}
