import type { DocumentEventRecord, LourexDocument, VaultPayload } from '../types.js';
import { assertGovernancePermission } from './governance.js';
import { createDocumentEvent } from './document-lifecycle.js';
import { validateDocument } from './documents.js';
import { isIsoDate, todayIso } from './id.js';
import { decimalToScaled } from './money.js';
import { assertSalesOrderIntegrity, salesOrderForQuotation, type AcceptedSalesOrder } from './sales-order-flow.js';
import { t } from './i18n.js';

const PROOF_MARKER='@lourex:sales-order:delivery-confirmed:v1:';
const MAPPING_MARKER='@lourex:sales-order:delivery-draft:v2:';
const LEGACY_MARKER='@lourex:sales-order:delivery-draft:v1:';
const QTY_PATTERN=/^\d{1,15}(?:\.\d{1,4})?$/;
const SCALE=10_000n;
function fail(en:string,ar:string):never{throw new Error(t(en,ar));}
function scaled(value:string):bigint{return decimalToScaled(value,4);}
function quantity(value:bigint):string{
  const sign=value<0n?'-':'',abs=value<0n?-value:value;
  return (sign+`${abs/SCALE}.${(abs%SCALE).toString().padStart(4,'0')}`).replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
}
export interface SalesDeliveryMapping{
  quotationId:string;
  salesOrderNumber:string;
  lines:{salesOrderLineId:string;deliveryLineId:string}[];
}
export interface ConfirmedSalesDeliveryLine{
  salesOrderLineId:string;
  deliveryLineId:string;
  quantity:string;
  unit:string;
}
export interface ConfirmedSalesDelivery{
  quotationId:string;
  salesOrderNumber:string;
  deliveryNoteId:string;
  deliveryNoteNumber:string;
  deliveryNoteUpdatedAt:string;
  customerId:string;
  currency:string;
  deliveredDate:string;
  reference:string;
  notes:string;
  confirmedByMemberId:string;
  lines:ConfirmedSalesDeliveryLine[];
}
export interface ConfirmSalesDeliveryInput{
  deliveryNoteId:string;
  expectedDeliveryNoteUpdatedAt:string;
  deliveredDate:string;
  reference:string;
  notes?:string;
  confirmed:boolean;
}
export interface SalesDeliveryBalance{
  salesOrderLineId:string;
  ordered:string;
  delivered:string;
  remaining:string;
}
export function isConfirmedSalesDeliveryEvent(event:DocumentEventRecord):boolean{
  return event.type==='audit'&&event.note.startsWith(PROOF_MARKER);
}
export function confirmedSalesDeliveries(deliveryNoteId:string,events:DocumentEventRecord[]):ConfirmedSalesDelivery[]{
  return events.filter(event=>event.documentId===deliveryNoteId&&isConfirmedSalesDeliveryEvent(event))
    .flatMap(event=>{
      try{
        const row=JSON.parse(event.note.slice(PROOF_MARKER.length)) as ConfirmedSalesDelivery;
        if(!row||row.deliveryNoteId!==deliveryNoteId||!row.quotationId||!row.salesOrderNumber
          ||!row.deliveryNoteNumber||!row.deliveryNoteUpdatedAt||!row.customerId||!row.currency
          ||!row.reference||!isIsoDate(row.deliveredDate)||!Array.isArray(row.lines)||!row.lines.length
          ||row.lines.some(line=>!line||!line.salesOrderLineId||!line.deliveryLineId||!line.unit
            ||typeof line.quantity!=='string'||!QTY_PATTERN.test(line.quantity)||scaled(line.quantity)<=0n))return[];
        return [row];
      }catch{return[];}
    });
}
export function salesDeliveryBalances(order:AcceptedSalesOrder,events:DocumentEventRecord[]):SalesDeliveryBalance[]{
  const proofs=events.filter(isConfirmedSalesDeliveryEvent).flatMap(event=>confirmedSalesDeliveries(event.documentId,[event]))
    .filter(proof=>proof.quotationId===order.quotationId);
  return order.lines.map(line=>{
    const delivered=proofs.reduce((sum,proof)=>sum+proof.lines.reduce((part,item)=>
      part+(item.salesOrderLineId===line.quotationLineId?scaled(item.quantity):0n),0n),0n);
    return{salesOrderLineId:line.quotationLineId,ordered:quantity(scaled(line.quantity)),
      delivered:quantity(delivered),remaining:quantity(scaled(line.quantity)-delivered)};
  });
}
function sourceEvent(deliveryNoteId:string,events:DocumentEventRecord[]):DocumentEventRecord|undefined{
  return events.find(event=>event.documentId===deliveryNoteId&&event.type==='created'&&event.relatedDocumentId);
}
export function deliverySalesOrderContext(delivery:LourexDocument,documents:LourexDocument[],events:DocumentEventRecord[]):
  {order:AcceptedSalesOrder;quotation:LourexDocument;creation:DocumentEventRecord}|null{
  if(delivery.kind!=='delivery-note')return null;
  const creation=sourceEvent(delivery.id,events);
  const source=documents.find(item=>item.id===creation?.relatedDocumentId);
  if(!source)return null;
  const quoteId=source.kind==='invoice'?source.convertedFromId:source.id;
  if(!quoteId)return null;
  const order=salesOrderForQuotation(quoteId,events);
  const quotation=documents.find(doc=>doc.id===quoteId);
  return order&&quotation&&creation?{order,quotation,creation}:null;
}
function proofLineMapping(delivery:LourexDocument,context:NonNullable<ReturnType<typeof deliverySalesOrderContext>>):Map<string,string>{
  const {order,creation}=context;
  const map=new Map<string,string>();
  if(creation.note.startsWith(MAPPING_MARKER)){
    let payload:SalesDeliveryMapping;
    try{payload=JSON.parse(creation.note.slice(MAPPING_MARKER.length)) as SalesDeliveryMapping;}
    catch{return map;}
    if(!payload||payload.quotationId!==order.quotationId||payload.salesOrderNumber!==order.salesOrderNumber
      ||!Array.isArray(payload.lines))return map;
    for(const line of payload.lines){
      if(!line?.deliveryLineId||!line.salesOrderLineId||map.has(line.deliveryLineId))return new Map();
      map.set(line.deliveryLineId,line.salesOrderLineId);
    }
  }else if(creation.note===LEGACY_MARKER+order.salesOrderNumber){
    // Preserve Batch 7 pre-confirmation delivery drafts, which originally copied
    // quote lines one-for-one without recording a formal source item mapping.
    if(delivery.items.length!==order.lines.length)return map;
    delivery.items.forEach((line,i)=>{const from=order.lines[i];if(from)map.set(line.id,from.quotationLineId);});
  }
  return map;
}
export function confirmSalesDelivery(vault:VaultPayload,input:ConfirmSalesDeliveryInput):
  {vault:VaultPayload;delivery:ConfirmedSalesDelivery}{
  const actor=assertGovernancePermission(vault,'confirm-sales-delivery');
  if(!input.confirmed)fail('Confirm physical delivery before recording fulfillment.','أكد التسليم الفعلي قبل تسجيل الوفاء بالطلب.');
  const doc=vault.documents.find(item=>item.id===input.deliveryNoteId);
  if(!doc||doc.kind!=='delivery-note'||doc.role!=='standard'||doc.status!=='final'||doc.lifecycleStatus==='voided')
    fail('A valid issued Delivery Note is required to confirm a Sales Order delivery.','يلزم سند تسليم صادر وسارٍ لتأكيد تسليم أمر البيع.');
  if(!input.expectedDeliveryNoteUpdatedAt||input.expectedDeliveryNoteUpdatedAt!==doc.updatedAt)
    fail('Delivery Note changed. Reopen the latest version.','تغير سند التسليم. افتح أحدث نسخة.');
  if(Object.keys(validateDocument(doc)).length)
    fail('Correct the invalid Delivery Note before confirming delivery.','صحح سند التسليم قبل تأكيد التسليم.');
  if(confirmedSalesDeliveries(doc.id,vault.documentEvents).length)
    fail('This Delivery Note has already been confirmed.','تم تأكيد سند التسليم هذا مسبقًا.');
  const context=deliverySalesOrderContext(doc,vault.documents,vault.documentEvents);
  if(!context)fail('Delivery Note must be linked to an accepted Sales Order.','يجب أن يرتبط سند التسليم بأمر بيع معتمد.');
  assertSalesOrderIntegrity(vault.documents,vault.documentEvents);
  const {order,creation}=context;
  if(creation.note!==LEGACY_MARKER+order.salesOrderNumber&&!creation.note.startsWith(MAPPING_MARKER))
    fail('Delivery Note must have a traceable Sales Order source.','يجب وجود مرجع موثق لأمر البيع في سند التسليم.');
  const customerId=doc.customerSnapshot?.sourceCustomerId||'';
  if(customerId!==order.customerId||doc.currency!==order.currency)
    fail('Delivery customer or currency differs from the Sales Order.','عميل سند التسليم أو عملته مختلفان عن أمر البيع.');
  const reference=input.reference.trim(),date=input.deliveredDate.trim(),notes=(input.notes||'').trim();
  if(!reference||reference.length>100||/[\u0000-\u001f]/.test(reference))
    fail('Physical delivery reference is required (maximum 100 characters).','مرجع التسليم الفعلي مطلوب وبحد أقصى 100 حرف.');
  if(!isIsoDate(date)||date<doc.issueDate||date>todayIso())
    fail('Delivery date must be after issue and no later than today.','تاريخ التسليم يجب أن يكون بعد إصدار السند ولا يتجاوز اليوم.');
  if(notes.length>500||/[\u0000-\u001f]/.test(notes))
    fail('Delivery notes are too long or invalid.','ملاحظات التسليم طويلة أو غير صالحة.');
  const referenced=new Set(vault.documentEvents.filter(isConfirmedSalesDeliveryEvent)
    .flatMap(event=>confirmedSalesDeliveries(event.documentId,[event]))
    .filter(proof=>proof.quotationId===order.quotationId)
    .map(proof=>proof.reference.toLowerCase().trim()));
  if(referenced.has(reference.toLowerCase()))
    fail('This Sales Order already has a confirmed delivery with this reference.','مرجع التسليم مكرر في أمر البيع.');
  const mapping=proofLineMapping(doc,context);
  const balances=new Map(salesDeliveryBalances(order,vault.documentEvents).map(row=>[row.salesOrderLineId,scaled(row.remaining)]));
  const orderLines=new Map(order.lines.map(line=>[line.quotationLineId,line]));
  if(!doc.items.length)fail('Delivery Note contains no items.','سند التسليم بلا أصناف.');
  const used=new Set<string>();
  const lines:ConfirmedSalesDeliveryLine[]=doc.items.map(line=>{
    const quoteId=mapping.get(line.id),accepted=quoteId?orderLines.get(quoteId):undefined;
    if(!accepted||used.has(accepted.quotationLineId)||accepted.unit!==line.unit
      ||accepted.descriptionEn!==line.descriptionEn||accepted.descriptionAr!==line.descriptionAr)
      fail('Delivery Note line has no unique matching Sales Order line.','بند سند التسليم لا يطابق بندًا فريدًا بأمر البيع.');
    if(!QTY_PATTERN.test(line.quantity)||scaled(line.quantity)<=0n
      ||scaled(line.quantity)>(balances.get(accepted.quotationLineId)||0n))
      fail('Delivered quantity exceeds the remaining Sales Order quantity.','كمية التسليم تتجاوز المتبقي بأمر البيع.');
    used.add(accepted.quotationLineId);
    return{salesOrderLineId:accepted.quotationLineId,deliveryLineId:line.id,quantity:line.quantity,unit:line.unit};
  });
  const delivery:ConfirmedSalesDelivery={
    quotationId:order.quotationId,salesOrderNumber:order.salesOrderNumber,
    deliveryNoteId:doc.id,deliveryNoteNumber:doc.number,deliveryNoteUpdatedAt:doc.updatedAt,
    customerId:order.customerId,currency:order.currency,deliveredDate:date,reference,notes,
    confirmedByMemberId:actor.id,lines
  };
  const event=createDocumentEvent(doc,'audit',PROOF_MARKER+JSON.stringify(delivery));
  const updated={...vault,documentEvents:[...vault.documentEvents,event]};
  assertSalesDeliveryIntegrity(updated.documents,updated.documentEvents);
  return {vault:updated,delivery};
}
/** Enforce across every confirmed delivery after cross-device merged edits. */
export function assertSalesDeliveryIntegrity(documents:LourexDocument[],events:DocumentEventRecord[]):void{
  const records=events.filter(isConfirmedSalesDeliveryEvent);
  if(!records.length)return;
  assertSalesOrderIntegrity(documents,events);
  const docs=new Map(documents.map(doc=>[doc.id,doc]));
  const seenNotes=new Set<string>(),seenReferences=new Set<string>();
  const totals=new Map<string,bigint>();
  for(const event of records){
    const list=confirmedSalesDeliveries(event.documentId,[event]);
    if(list.length!==1)fail('Confirmed delivery audit evidence is invalid.','سجل إثبات التسليم تالف أو غير صالح.');
    const proof=list[0]!,doc=docs.get(event.documentId);
    if(!doc||doc.kind!=='delivery-note'||doc.status!=='final'||doc.lifecycleStatus==='voided'
      ||proof.deliveryNoteId!==doc.id||proof.deliveryNoteNumber!==doc.number
      ||proof.deliveryNoteUpdatedAt!==doc.updatedAt||proof.customerId!==doc.customerSnapshot?.sourceCustomerId
      ||proof.currency!==doc.currency)
      fail('Confirmed Delivery Note identity or version changed.','هوية أو نسخة سند التسليم المؤكد تغيرت.');
    if(seenNotes.has(doc.id))fail('The same Delivery Note was confirmed twice during sync.','تم تأكيد سند التسليم مرتين أثناء المزامنة.');
    seenNotes.add(doc.id);
    const context=deliverySalesOrderContext(doc,documents,events);
    if(!context||proof.quotationId!==context.order.quotationId
      ||proof.salesOrderNumber!==context.order.salesOrderNumber||proof.customerId!==context.order.customerId)
      fail('Confirmed delivery has no matching accepted Sales Order.','التسليم المؤكد لا يطابق أمر بيع معتمدًا.');
    const {order}=context;
    const refKey=JSON.stringify([order.quotationId,proof.reference.trim().toLowerCase()]);
    if(seenReferences.has(refKey))fail('Duplicate Sales Order delivery reference detected on sync.','مرجع تسليم أمر البيع مكرر أثناء المزامنة.');
    seenReferences.add(refKey);
    if(proof.deliveredDate<doc.issueDate||proof.deliveredDate>todayIso())
      fail('Confirmed delivery date is invalid.','تاريخ التسليم المؤكد غير صالح.');
    const itemMap=new Map(doc.items.map(item=>[item.id,item]));
    const acceptedLines=new Map(order.lines.map(line=>[line.quotationLineId,line]));
    const mapping=proofLineMapping(doc,context);
    const used=new Set<string>(),lineIds=new Set<string>();
    if(proof.lines.length!==doc.items.length)fail('Confirmed delivery line count differs from the issued note.','عدد بنود التسليم المؤكد يختلف عن السند.');
    for(const line of proof.lines){
      const docItem=itemMap.get(line.deliveryLineId),sourceLine=acceptedLines.get(line.salesOrderLineId);
      if(!docItem||!sourceLine||lineIds.has(line.deliveryLineId)||used.has(line.salesOrderLineId)
        ||mapping.get(line.deliveryLineId)!==line.salesOrderLineId
        ||sourceLine.unit!==line.unit||docItem.unit!==line.unit
        ||docItem.descriptionEn!==sourceLine.descriptionEn||docItem.descriptionAr!==sourceLine.descriptionAr
        ||!QTY_PATTERN.test(docItem.quantity)||scaled(docItem.quantity)!==scaled(line.quantity))
        fail('Confirmed delivered items or quantities differ from Sales Order / Delivery Note.','أصناف أو كميات التسليم لا تطابق أمر البيع وسند التسليم.');
      used.add(line.salesOrderLineId);lineIds.add(line.deliveryLineId);
      const key=JSON.stringify([order.quotationId,line.salesOrderLineId]);
      totals.set(key,(totals.get(key)||0n)+scaled(line.quantity));
      if((totals.get(key)||0n)>scaled(sourceLine.quantity))
        fail('Concurrent deliveries exceed ordered quantities. Reconcile before sync.','تتجاوز التسليمات المتزامنة الكميات المطلوبة. راجعها قبل المزامنة.');
    }
  }
}