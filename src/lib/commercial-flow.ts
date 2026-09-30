import type { DocumentEventRecord, LourexDocument } from '../types.js';
import { isIsoDate } from './id.js';

export type CommercialTrackingStatus='draft'|'internal-ready'|'sent'|'accepted'|'rejected'|'expired'|'converted';

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
  linkedInvoice:LourexDocument|null;
  expiresAt:string;
  events:DocumentEventRecord[];
  flow:CommercialFlowNode[];
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
  const effective=effectiveCommercialStatus(doc,documents,tracking,today);
  return{
    status:effective.status,
    statusSource:effective.source,
    linkedInvoice:linkedInvoiceForCommercialDocument(doc,documents),
    expiresAt:quoteExpiryDate(doc),
    events:commercialEvidence(doc,documents,events),
    flow:commercialFlowDocuments(doc,documents)
  };
}

export function commercialStatusLabel(status:CommercialTrackingStatus,arabic=false):string{
  const en:Record<CommercialTrackingStatus,string>={draft:'Draft', 'internal-ready':'Ready to send',sent:'Sent',accepted:'Accepted',rejected:'Rejected',expired:'Expired',converted:'Converted'};
  const ar:Record<CommercialTrackingStatus,string>={draft:'مسودة','internal-ready':'جاهز للإرسال',sent:'تم الإرسال',accepted:'مقبول',rejected:'مرفوض',expired:'منتهي',converted:'تم التحويل'};
  return(arabic?ar:en)[status];
}

export function trackingTimestamp(value:string|undefined):string{
  return value&&dateOnly(value)?value:'';
}
