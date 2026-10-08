import type { DocumentEventRecord, LourexDocument, VaultPayload } from '../types.js';
import { createBlankDocument, nextDocumentNumber, validateDocument } from './documents.js';
import { createDocumentEvent } from './document-lifecycle.js';
import { makeId } from './id.js';
import { t } from './i18n.js';

/**
 * Batch 7 / procurement, step 1: RFQ -> reviewed Purchase Order draft.
 * Links use the existing encrypted, conflict-merged document events, without
 * misusing convertedFromId (reserved for quotation -> sales invoice).
 * This stage never receives inventory or creates a supplier payable.
 */
export function purchaseOrderSourceEligible(source:LourexDocument):boolean{
  return source.kind==='rfq'&&source.role==='standard'&&source.status==='final'&&source.lifecycleStatus!=='voided';
}

export function linkedPurchaseOrders(
  source:LourexDocument,documents:LourexDocument[],events:DocumentEventRecord[]
):LourexDocument[]{
  if(source.kind!=='rfq')return[];
  const ids=new Set(events.filter(event=>event.type==='created'&&event.relatedDocumentId===source.id)
    .map(event=>event.documentId));
  return documents.filter(doc=>doc.kind==='purchase-order'&&doc.role==='standard'&&ids.has(doc.id));
}

export function purchaseOrderSource(
  order:LourexDocument,documents:LourexDocument[],events:DocumentEventRecord[]
):LourexDocument|undefined{
  if(order.kind!=='purchase-order')return undefined;
  const linked=events.find(event=>event.type==='created'&&event.documentId===order.id&&event.relatedDocumentId);
  const source=documents.find(doc=>doc.id===linked?.relatedDocumentId);
  return source?.kind==='rfq'?source:undefined;
}

export function createLinkedPurchaseOrderDraft(
  vault:VaultPayload,sourceId:string
):{vault:VaultPayload;document:LourexDocument;created:boolean}{
  const source=vault.documents.find(doc=>doc.id===sourceId);
  if(!source||!purchaseOrderSourceEligible(source)){
    throw new Error(t('A purchase order requires an active issued RFQ.','يتطلب أمر الشراء طلب عرض سعر صادرًا وساريًا.'));
  }
  const existing=linkedPurchaseOrders(source,vault.documents,vault.documentEvents)
    .find(doc=>doc.lifecycleStatus!=='voided');
  if(existing)return{vault,document:existing,created:false};
  if(Object.keys(validateDocument(source)).length){
    throw new Error(t('Correct the RFQ before creating a purchase order.','صحّح طلب عرض السعر قبل إنشاء أمر الشراء.'));
  }
  const numbered=nextDocumentNumber(vault,'purchase-order');
  const base=createBlankDocument('purchase-order',numbered.number,vault.company);
  const reference=source.language==='ar'?`مرجع طلب عرض السعر: ${source.number}`:
    source.language==='bilingual'?`Based on RFQ ${source.number} / مرجع طلب عرض السعر: ${source.number}`:
    `Based on RFQ ${source.number}`;
  const document:LourexDocument={
    ...base,
    currency:source.currency,language:source.language,
    supplierSnapshot:structuredClone(source.supplierSnapshot??null),
    supplierReference:source.supplierReference??'',
    items:source.items.map(item=>({...item,id:makeId('item'),unitPrice:'',unitCost:''})),
    terms:{...base.terms,incoterm:source.terms.incoterm,packing:source.terms.packing,
      deliveryTime:source.terms.deliveryTime,portOfLoading:source.terms.portOfLoading,
      finalDestination:source.terms.finalDestination,countryOfOrigin:source.terms.countryOfOrigin,
      remarks:[reference,source.terms.remarks.trim()].filter(Boolean).join('\n')}
  };
  const documentEvents=[...vault.documentEvents,createDocumentEvent(document,'created','',source)];
  return{
    vault:{...numbered.vault,documents:[...numbered.vault.documents,document],documentEvents},
    document,created:true
  };
}
