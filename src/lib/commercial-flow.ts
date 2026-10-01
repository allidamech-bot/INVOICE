import type { DocumentEventRecord, DocumentEventType, LourexDocument, VaultPayload } from '../types.js';
import { isIsoDate, makeId } from './id.js';

export type CommercialTrackingStatus='draft'|'internal-ready'|'sent'|'accepted'|'rejected'|'expired'|'converted';
export type CommercialTrackingEventKind='sent'|'viewed'|'commented'|'accepted'|'rejected'|'followup-scheduled'|'followup-completed';

// Batch 1 deliberately stores commercial tracking inside the already encrypted,
// conflict-merged document event ledger. A reserved note marker keeps these sales
// events separate from accounting/document lifecycle semantics without introducing
// a second storage silo or changing DocumentStatus / DocumentLifecycleStatus.
const COMMERCIAL_MARKER='@lourex:commercial:v1:';

export interface CommercialTrackingOverlay {
  documentId:string;
  status:'sent'|'accepted'|'rejected'|'';
  sentAt?:string;
  viewedAt?:string;
  lastCommentAt?:string;
  lastComment?:string;
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

export function commercialTrackingEventKind(event:DocumentEventRecord):CommercialTrackingEventKind|null{
  if(event.type!=='created'||!event.note.startsWith(COMMERCIAL_MARKER))return null;
  const firstLine=event.note.split('\n',1)[0]??'';
  const kind=firstLine.slice(COMMERCIAL_MARKER.length);
  return kind==='sent'||kind==='viewed'||kind==='commented'||kind==='accepted'||kind==='rejected'||kind==='followup-scheduled'||kind==='followup-completed'?kind:null;
}

export function commercialTrackingEventPayload(event:DocumentEventRecord):string{
  if(!commercialTrackingEventKind(event))return'';
  const newline=event.note.indexOf('\n');
  return newline<0?'':event.note.slice(newline+1).trim();
}

export function isCommercialTrackingEvent(event:DocumentEventRecord):boolean{return commercialTrackingEventKind(event)!==null;}
export function isLifecycleDocumentEvent(event:DocumentEventRecord):event is DocumentEventRecord&{type:DocumentEventType}{return !isCommercialTrackingEvent(event);}

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
  const tracking:CommercialTrackingOverlay={documentId,status:'',sentAt:'',viewedAt:'',lastCommentAt:'',lastComment:'',acceptedAt:'',rejectedAt:'',rejectionReason:'',followUpAt:'',lastFollowUpAt:'',updatedAt:''};
  const relevant=events.filter(event=>event.documentId===documentId&&isCommercialTrackingEvent(event)).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  for(const event of relevant){
    const kind=commercialTrackingEventKind(event);if(!kind)continue;
    const terminal=tracking.status==='accepted'||tracking.status==='rejected';
    // Concurrent cloud merges can legitimately append an older device's event
    // after another device already recorded a terminal decision. Terminal sales
    // decisions are monotonic: a late Sent/Follow-up/opposite decision cannot
    // downgrade or silently replace Accepted/Rejected once the ledger contains it.
    if(terminal&&kind!=='viewed'&&kind!=='commented')continue;
    const payload=commercialTrackingEventPayload(event);
    tracking.updatedAt=event.at;
    if(kind==='sent'){
      tracking.status='sent';tracking.sentAt=event.at;tracking.acceptedAt='';tracking.rejectedAt='';tracking.rejectionReason='';
    }else if(kind==='viewed'){
      if(!tracking.viewedAt)tracking.viewedAt=event.at;
    }else if(kind==='commented'){
      tracking.lastCommentAt=event.at;tracking.lastComment=payload;
    }else if(kind==='accepted'){
      tracking.status='accepted';tracking.acceptedAt=event.at;tracking.rejectedAt='';tracking.rejectionReason='';tracking.followUpAt='';
    }else if(kind==='rejected'){
      tracking.status='rejected';tracking.rejectedAt=event.at;tracking.acceptedAt='';tracking.rejectionReason=payload;tracking.followUpAt='';
    }else if(kind==='followup-scheduled'){
      tracking.followUpAt=isIsoDate(payload)?payload:'';
    }else if(kind==='followup-completed'){
      tracking.lastFollowUpAt=event.at;tracking.followUpAt='';
    }
  }
  return tracking;
}

export function createCommercialTrackingEvent(doc:LourexDocument,kind:CommercialTrackingEventKind,payload='',at=new Date().toISOString(),relatedDocumentId='',relatedDocumentNumber=''):DocumentEventRecord{
  const recordedAt=!Number.isNaN(Date.parse(at))?at:new Date().toISOString();
  const note=`${COMMERCIAL_MARKER}${kind}${payload.trim()?`\n${payload.trim()}`:''}`;
  return{
    id:makeId('event'),documentId:doc.id,documentNumber:doc.number,type:'created',at:recordedAt,note,
    relatedDocumentId,relatedDocumentNumber,amount:'',currency:doc.currency
  };
}

export function effectiveCommercialStatus(
  doc:LourexDocument,
  documents:LourexDocument[],
  tracking?:CommercialTrackingOverlay|null,
  today=new Date().toISOString().slice(0,10)
):{status:CommercialTrackingStatus;source:CommercialFlowSnapshot['statusSource']}{
  if(doc.kind==='invoice'&&doc.role==='standard'&&Boolean(doc.convertedFromId))return{status:'converted',source:'conversion'};
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

/**
 * Validate against the latest vault snapshot, not the UI's potentially stale copy.
 * The returned event can then be appended atomically through mutateVaultSafely().
 */
export function validatedCommercialTrackingEvent(
  vault:Pick<VaultPayload,'documents'|'documentEvents'>,
  documentId:string,
  kind:CommercialTrackingEventKind,
  payload='',
  today=new Date().toISOString().slice(0,10)
):DocumentEventRecord{
  const doc=vault.documents.find(item=>item.id===documentId);
  if(!doc)throw new Error('Quotation no longer exists. Reopen Documents and try again.');
  if(kind==='viewed'||kind==='commented')throw new Error('Portal evidence can only be recorded by a secure customer link.');
  if(!isQuoteLikeDocument(doc))throw new Error('Commercial tracking is available only for quotations and proforma invoices.');
  if(doc.status!=='final'||doc.lifecycleStatus==='voided')throw new Error('Issue an active final quotation before recording external commercial tracking.');
  if(linkedInvoiceForCommercialDocument(doc,vault.documents))throw new Error('This quotation is already converted to an invoice.');

  const tracking=commercialTrackingFromEvents(doc.id,vault.documentEvents);
  const effective=effectiveCommercialStatus(doc,vault.documents,tracking,today).status;
  const terminal=effective==='accepted'||effective==='rejected'||effective==='converted';
  if(terminal)throw new Error('This commercial decision is already closed.');

  const clean=payload.trim();
  if(kind==='sent'&&effective==='expired')throw new Error('This quotation is expired. Reissue or revise it before recording a new send.');
  if(kind==='sent'&&tracking.status==='sent')throw new Error('Sent is already recorded for this quotation.');
  if(kind==='rejected'&&!clean)throw new Error('Enter the rejection reason first.');
  if(kind==='followup-scheduled'){
    if(!isIsoDate(clean))throw new Error('Choose a valid follow-up date.');
    if(isIsoDate(today)&&clean<today)throw new Error('Follow-up date cannot be in the past.');
  }
  if(kind==='followup-completed'&&!tracking.followUpAt)throw new Error('Schedule a follow-up before marking it complete.');

  return createCommercialTrackingEvent(doc,kind,clean);
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
