import type { CommercialDocumentEventType, DocumentEventRecord, DocumentEventType, LourexDocument } from '../types.js';
import { isIsoDate, makeId } from './id.js';

export type CommercialTrackingStatus='draft'|'internal-ready'|'sent'|'accepted'|'rejected'|'expired'|'converted';

const COMMERCIAL_EVENT_TYPES = new Set<CommercialDocumentEventType>([
  'commercial-sent','commercial-accepted','commercial-rejected','commercial-followup-scheduled','commercial-followup-completed'
]);

export interface CommercialTrackingOverlay {
  documentId:string;
  status:'sent'|'accepted'|'rejected'|'';
  sentAt?:string;
  acceptedAt?:string;
  rejectedAt?:string;
  rejectionReason?:string;
  followUpAt?:string;
  lastFollowUpAt?:string;
  updatedAt?:string;
}

export interface CommercialFlowNode {
  document:LourexDocument;
  relation:'source'|'current'|'converted'|'credit';
}

export interface CommercialFlowSnapshot {
  status:CommercialTrackingStatus;
  statusSource:'document'|'tracking'|'date'|'conversion';
  tracking:CommercialTrackingOverlay;
  linkedInvoice:LourexDocument|null;
  expiresAt:string;
  events:DocumentEventRecord[];
  flow:CommercialFlowNode[];
}

export function isCommercialDocumentEventType(type:DocumentEventRecord['type']):type is CommercialDocumentEventType{
  return COMMERCIAL_EVENT_TYPES.has(type as CommercialDocumentEventType);
}

export function isLifecycleDocumentEventType(type:DocumentEventRecord['type']):type is DocumentEventType{
  return !isCommercialDocumentEventType(type);
}

export function isQuoteLikeDocument(doc:LourexDocument):boolean{
  return doc.role==='standard'&&(doc.kind==='proforma'||doc.kind==='proforma-invoice');
}

export function linkedInvoiceForCommercialDocument(doc:LourexDocument,documents:LourexDocument[]):LourexDocument|null{
  if(!isQuoteLikeDocument(doc))return null;
  return documents.find(candidate=>candidate.kind==='invoice'&&candidate.role==='standard'&&candidate.convertedFromId===doc.id&&candidate.lifecycleStatus!=='voided')??null;
}

export function quoteExpiryDate(doc:LourexDocument):string{
  if(!isQuoteLikeDocument(doc)||!isIsoDate(doc.dueDate))return'';
  return doc.dueDate;
}

function dateOnly(value:string):string{return /^\d{4}-\d{2}-\d{2}/.test(value)?value.slice(0,10):'';}

export function commercialTrackingFromEvents(documentId:string,events:DocumentEventRecord[]):CommercialTrackingOverlay{
  const tracking:CommercialTrackingOverlay={documentId,status:'',sentAt:'',acceptedAt:'',rejectedAt:'',rejectionReason:'',followUpAt:'',lastFollowUpAt:'',updatedAt:''};
  const relevant=events.filter(event=>event.documentId===documentId&&isCommercialDocumentEventType(event.type)).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  for(const event of relevant){
    tracking.updatedAt=event.at;
    if(event.type==='commercial-sent'){
      tracking.status='sent';tracking.sentAt=event.at;tracking.acceptedAt='';tracking.rejectedAt='';tracking.rejectionReason='';
    }else if(event.type==='commercial-accepted'){
      tracking.status='accepted';tracking.acceptedAt=event.at;tracking.rejectedAt='';tracking.rejectionReason='';
    }else if(event.type==='commercial-rejected'){
      tracking.status='rejected';tracking.rejectedAt=event.at;tracking.acceptedAt='';tracking.rejectionReason=event.note.trim();
    }else if(event.type==='commercial-followup-scheduled'){
      tracking.followUpAt=isIsoDate(event.note.trim())?event.note.trim():'';
    }else if(event.type==='commercial-followup-completed'){
      tracking.lastFollowUpAt=event.at;tracking.followUpAt='';
    }
  }
  return tracking;
}

export function createCommercialTrackingEvent(doc:LourexDocument,type:CommercialDocumentEventType,note=''):DocumentEventRecord{
  const now=new Date().toISOString();
  return{
    id:makeId('event'),documentId:doc.id,documentNumber:doc.number,type,at:now,note:note.trim(),
    relatedDocumentId:'',relatedDocumentNumber:'',amount:'',currency:doc.currency
  };
}

export function effectiveCommercialStatus(
  doc:LourexDocument,
  documents:LourexDocument[],
  tracking?:CommercialTrackingOverlay|null,
  today=new Date().toISOString().slice(0,10)
):{status:CommercialTrackingStatus;source:CommercialFlowSnapshot['statusSource']}{
  if(!isQuoteLikeDocument(doc))return{status:doc.status==='final'?'internal-ready':'draft',source:'document'};
  if(linkedInvoiceForCommercialDocument(doc,documents))return{status:'converted',source:'conversion'};

  const tracked=tracking?.documentId===doc.id?tracking:null;
  if(tracked?.status==='accepted')return{status:'accepted',source:'tracking'};
  if(tracked?.status==='rejected')return{status:'rejected',source:'tracking'};

  const expiresAt=quoteExpiryDate(doc);
  if(doc.status==='final'&&expiresAt&&isIsoDate(today)&&expiresAt<today)return{status:'expired',source:'date'};
  if(tracked?.status==='sent')return{status:'sent',source:'tracking'};
  return{status:doc.status==='final'?'internal-ready':'draft',source:'document'};
}

export function commercialFlowDocuments(doc:LourexDocument,documents:LourexDocument[]):CommercialFlowNode[]{
  const byId=new Map(documents.map(item=>[item.id,item]));
  let root=doc;
  const ancestry:LourexDocument[]=[];
  const seen=new Set<string>();
  while(root.convertedFromId&&!seen.has(root.convertedFromId)){
    seen.add(root.id);
    const parent=byId.get(root.convertedFromId);
    if(!parent)break;
    ancestry.unshift(parent);
    root=parent;
  }

  const result:CommercialFlowNode[]=[];
  const added=new Set<string>();
  const add=(document:LourexDocument,relation:CommercialFlowNode['relation'])=>{
    if(added.has(document.id))return;
    added.add(document.id);result.push({document,relation});
  };
  ancestry.forEach(source=>add(source,'source'));
  add(doc,'current');

  const queue=[root,...documents.filter(item=>item.convertedFromId===root.id)];
  for(const item of queue){
    if(item.id!==doc.id)add(item,item.convertedFromId?'converted':'source');
    for(const child of documents.filter(candidate=>candidate.convertedFromId===item.id)){
      add(child,'converted');
      for(const credit of documents.filter(candidate=>candidate.role==='credit-note'&&candidate.creditForId===child.id))add(credit,'credit');
    }
    if(item.kind==='invoice')for(const credit of documents.filter(candidate=>candidate.role==='credit-note'&&candidate.creditForId===item.id))add(credit,'credit');
  }
  return result;
}

export function commercialEvidence(doc:LourexDocument,documents:LourexDocument[],events:DocumentEventRecord[]):DocumentEventRecord[]{
  const ids=new Set(commercialFlowDocuments(doc,documents).map(node=>node.document.id));
  ids.add(doc.id);
  return events.filter(event=>ids.has(event.documentId)||ids.has(event.relatedDocumentId)).sort((a,b)=>a.at.localeCompare(b.at));
}

export function buildCommercialFlowSnapshot(
  doc:LourexDocument,
  documents:LourexDocument[],
  events:DocumentEventRecord[],
  tracking?:CommercialTrackingOverlay|null,
  today=new Date().toISOString().slice(0,10)
):CommercialFlowSnapshot{
  const derivedTracking=tracking?.documentId===doc.id?tracking:commercialTrackingFromEvents(doc.id,events);
  const effective=effectiveCommercialStatus(doc,documents,derivedTracking,today);
  return{
    status:effective.status,
    statusSource:effective.source,
    tracking:derivedTracking,
    linkedInvoice:linkedInvoiceForCommercialDocument(doc,documents),
    expiresAt:quoteExpiryDate(doc),
    events:commercialEvidence(doc,documents,events),
    flow:commercialFlowDocuments(doc,documents)
  };
}

export function commercialStatusLabel(status:CommercialTrackingStatus,arabic=false):string{
  const en:Record<CommercialTrackingStatus,string>={draft:'Draft','internal-ready':'Ready to send',sent:'Sent',accepted:'Accepted',rejected:'Rejected',expired:'Expired',converted:'Converted'};
  const ar:Record<CommercialTrackingStatus,string>={draft:'مسودة','internal-ready':'جاهز للإرسال',sent:'تم الإرسال',accepted:'مقبول',rejected:'مرفوض',expired:'منتهي',converted:'تم التحويل'};
  return(arabic?ar:en)[status];
}

export function trackingTimestamp(value:string|undefined):string{
  return value&&dateOnly(value)?value:'';
}
