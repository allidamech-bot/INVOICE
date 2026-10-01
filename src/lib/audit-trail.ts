import type { DocumentEventRecord } from '../types.js';
import { makeId } from './id.js';

export const AUDIT_MARKER='[LOUREX_AUDIT_V1]';
export type AuditEntityType='document'|'customer'|'supplier'|'product'|'purchase';
export type AuditAction='created'|'updated'|'deleted'|'posted'|'reversed';
export type AuditActorKind='user'|'system';

export interface AuditEventInput {
  entityType:AuditEntityType;
  entityId:string;
  entityLabel:string;
  action:AuditAction;
  at?:string;
  note?:string;
  actorKind?:AuditActorKind;
  documentId?:string;
  documentNumber?:string;
  relatedDocumentId?:string;
  relatedDocumentNumber?:string;
  amount?:string;
  currency?:string;
  workspaceId?:string;
  branchId?:string;
}

export function createAuditEvent(input:AuditEventInput):DocumentEventRecord{
  const at=input.at&&!Number.isNaN(Date.parse(input.at))?input.at:new Date().toISOString();
  const documentId=input.entityType==='document'?input.entityId:(input.documentId||'');
  const documentNumber=input.entityType==='document'?input.entityLabel:(input.documentNumber||'');
  return{
    id:makeId('event'),documentId,documentNumber,type:'audit',at,
    note:input.note?.trim()||'',relatedDocumentId:input.relatedDocumentId||'',relatedDocumentNumber:input.relatedDocumentNumber||'',amount:input.amount||'',currency:(input.currency||'').trim().toUpperCase(),
    auditEntityType:input.entityType,auditEntityId:input.entityId,auditEntityLabel:input.entityLabel.trim(),auditAction:input.action,auditActorKind:input.actorKind||'user',workspaceId:input.workspaceId||'default',branchId:input.branchId||'main'
  };
}

export function isAuditEvent(event:DocumentEventRecord):boolean{return event.type==='audit'&&Boolean(event.auditEntityType&&event.auditEntityId&&event.auditAction);}
export function auditEntityType(event:DocumentEventRecord):AuditEntityType{
  if(event.auditEntityType==='customer'||event.auditEntityType==='supplier'||event.auditEntityType==='product'||event.auditEntityType==='purchase'||event.auditEntityType==='document')return event.auditEntityType;
  return'document';
}
export function auditEntityId(event:DocumentEventRecord):string{return event.auditEntityId||event.documentId||'';}
export function auditEntityLabel(event:DocumentEventRecord):string{return event.auditEntityLabel||event.documentNumber||'';}
export function auditAction(event:DocumentEventRecord):AuditAction|'event'{
  if(event.auditAction==='created'||event.auditAction==='updated'||event.auditAction==='deleted'||event.auditAction==='posted'||event.auditAction==='reversed')return event.auditAction;
  return'event';
}
export function auditEventsFor(events:DocumentEventRecord[],entityType:AuditEntityType,entityId:string,limit=50):DocumentEventRecord[]{
  return events.filter(event=>isAuditEvent(event)&&auditEntityType(event)===entityType&&auditEntityId(event)===entityId).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,Math.max(1,limit));
}
export function auditEventsGlobal(events:DocumentEventRecord[],limit=250):DocumentEventRecord[]{return [...events].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,Math.max(1,limit));}

export function auditActionLabel(action:AuditAction|'event',arabic=false):string{
  if(arabic){if(action==='created')return'تم الإنشاء';if(action==='updated')return'تم التعديل';if(action==='deleted')return'تم الحذف';if(action==='posted')return'تم الترحيل';if(action==='reversed')return'تم العكس';return'نشاط';}
  if(action==='created')return'Created';if(action==='updated')return'Updated';if(action==='deleted')return'Deleted';if(action==='posted')return'Posted';if(action==='reversed')return'Reversed';return'Activity';
}
export function auditEntityLabelText(type:AuditEntityType,arabic=false):string{
  if(arabic){if(type==='customer')return'عميل';if(type==='supplier')return'مورد';if(type==='product')return'صنف';if(type==='purchase')return'شراء';return'مستند';}
  if(type==='customer')return'Customer';if(type==='supplier')return'Supplier';if(type==='product')return'Product';if(type==='purchase')return'Purchase';return'Document';
}
