import type { DocumentEventRecord, LourexDocument, VaultPayload } from '../types.js';
import { createBlankDocument, nextDocumentNumber, validateDocument } from './documents.js';
import { createDocumentEvent } from './document-lifecycle.js';
import { makeId } from './id.js';
import { t } from './i18n.js';
import { salesOrderForQuotation, assertSalesOrderIntegrity } from './sales-order-flow.js';
import { confirmedSalesDeliveries, salesDeliveryBalances, type SalesDeliveryMapping } from './sales-delivery-flow.js';
import { decimalToScaled } from './money.js';

export function deliverySourceEligible(source:LourexDocument):boolean{
  return source.role==='standard'&&source.status==='final'&&source.lifecycleStatus!=='voided'&&['proforma','proforma-invoice','invoice'].includes(source.kind);
}

// A quotation and its converted invoice share one full delivery. Relations use the
// existing event ledger; convertedFromId retains its quotation-to-invoice meaning.
export function linkedDeliveries(source:LourexDocument,documents:LourexDocument[],events:DocumentEventRecord[]):LourexDocument[]{
  const origin=source.kind==='invoice'&&source.convertedFromId?source.convertedFromId:source.id;
  const family=new Set([origin,source.id,...documents.filter(doc=>doc.kind==='invoice'&&doc.convertedFromId===origin).map(doc=>doc.id)]);
  const ids=new Set(events.filter(event=>event.type==='created'&&family.has(event.relatedDocumentId)).map(event=>event.documentId));
  return documents.filter(doc=>doc.kind==='delivery-note'&&doc.role==='standard'&&ids.has(doc.id));
}

export function deliverySource(delivery:LourexDocument,documents:LourexDocument[],events:DocumentEventRecord[]):LourexDocument|undefined{
  if(delivery.kind!=='delivery-note')return undefined;
  const event=events.find(event=>event.documentId===delivery.id&&event.type==='created'&&event.relatedDocumentId);
  return documents.find(doc=>doc.id===event?.relatedDocumentId);
}

export function createLinkedDeliveryDraft(vault:VaultPayload,sourceId:string):{vault:VaultPayload;document:LourexDocument;created:boolean}{
  const source=vault.documents.find(doc=>doc.id===sourceId);
  if(!source||!deliverySourceEligible(source))throw new Error(t('Delivery requires an active issued quotation or invoice.','يتطلب التسليم عرض سعر أو فاتورة صادرة وسارية.'));
  const active=linkedDeliveries(source,vault.documents,vault.documentEvents).filter(doc=>doc.lifecycleStatus!=='voided');
  if(Object.keys(validateDocument(source)).length)throw new Error(t('The source document must be valid before creating a delivery draft.','يجب أن يكون المستند المصدر صالحًا قبل إنشاء مسودة التسليم.'));
  const sourceQuotation=source.kind==='invoice'&&source.convertedFromId
    ?vault.documents.find(doc=>doc.id===source.convertedFromId):source;
  const salesOrder=sourceQuotation?salesOrderForQuotation(sourceQuotation.id,vault.documentEvents):undefined;
  if(salesOrder){
    assertSalesOrderIntegrity(vault.documents,vault.documentEvents);
    const pending=active.find(doc=>!confirmedSalesDeliveries(doc.id,vault.documentEvents).length);
    if(pending)return{vault,document:pending,created:false};
    if(salesDeliveryBalances(salesOrder,vault.documentEvents).every(line=>decimalToScaled(line.remaining,4)<=0n)){
      throw new Error(t('All Sales Order quantities are already confirmed delivered.','تم تأكيد تسليم جميع كميات أمر البيع.'));
    }
  }else if(active[0])return{vault,document:active[0],created:false};
  const numbered=nextDocumentNumber(vault,'delivery-note');
  const base=createBlankDocument('delivery-note',numbered.number,vault.company);
  const balances=salesOrder?new Map(salesDeliveryBalances(salesOrder,vault.documentEvents).map(line=>[line.salesOrderLineId,line.remaining])):null;
  // Preserve legacy invoice-based deliveries when no accepted Sales Order exists.
  const committedItems=salesOrder?(sourceQuotation?.items??source.items):source.items;
  const linkedPairs=committedItems.flatMap(item=>{
    const remaining=balances?.get(item.id);
    if(salesOrder&&(!remaining||decimalToScaled(remaining,4)<=0n))return[];
    return [{salesOrderLineId:item.id,deliveryItem:{...item,id:makeId('item'),quantity:remaining??item.quantity,unitPrice:'',unitCost:''}}];
  });
  const linkedItems=linkedPairs.map(pair=>pair.deliveryItem);
  const mapping:SalesDeliveryMapping|undefined=salesOrder?{
    quotationId:salesOrder.quotationId,salesOrderNumber:salesOrder.salesOrderNumber,
    lines:linkedPairs.map(pair=>({salesOrderLineId:pair.salesOrderLineId,deliveryLineId:pair.deliveryItem.id}))
  }:undefined;
  const document:LourexDocument={...base,currency:source.currency,language:source.language,customerSnapshot:structuredClone(source.customerSnapshot),
    items:linkedItems,
    terms:{...base.terms,incoterm:source.terms.incoterm,packing:source.terms.packing,deliveryTime:source.terms.deliveryTime,portOfLoading:source.terms.portOfLoading,finalDestination:source.terms.finalDestination,countryOfOrigin:source.terms.countryOfOrigin,
      remarks:salesOrder?(source.language==='ar'?`تسليم مقابل أمر البيع ${salesOrder.salesOrderNumber}`:source.language==='bilingual'?`Delivery against Sales Order ${salesOrder.salesOrderNumber} / تسليم مقابل أمر البيع ${salesOrder.salesOrderNumber}`:`Delivery against Sales Order ${salesOrder.salesOrderNumber}`):source.language==='ar'?`تسليم مقابل ${source.number}`:source.language==='bilingual'?`Delivery against ${source.number} / تسليم مقابل ${source.number}`:`Delivery against ${source.number}`}};
  const documentEvents=[...vault.documentEvents,createDocumentEvent(document,'created',mapping
    ?'@lourex:sales-order:delivery-draft:v2:'+JSON.stringify(mapping):'',source)];
  return{vault:{...numbered.vault,documents:[...vault.documents,document],documentEvents},document,created:true};
}
