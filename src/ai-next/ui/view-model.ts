/**
 * R06 presentation-only types. None of these client types confer server
 * authority, evidence verification, approval or finance write capability.
 */
import type {AuthenticatedScope,Coverage,ReviewDraft,TaskState} from '../domain/contracts.js';
import {exactScopeKey} from '../domain/turn-journal.js';

export const R06_NEXT_CONVERSATION_ENABLED=false as const;
export const R06_MAX_VISIBLE_MESSAGES=80;
export const R06_MAX_ATTACHMENTS_PER_SELECTION=10;
export const R06_FINANCE_EDITOR_LINE_LIMIT=120;

export interface R06Message {
  messageId:string;turnId:string;role:'user'|'assistant';text:string;
  createdAt:string;sourceIds:string[];
}
export interface R06Attachment {
  sourceId:string;scopeKey:string;fileName:string;format:string;
  upload:'pending'|'uploading'|'uploaded'|'failed';
  parse:'not_started'|'parsing'|'parsed'|'partial'|'failed';
  coverage:Coverage|null;
  humanReview:'not_reviewed'|'needs_review'|'verified';
  serverAuthorizedForQuotation:boolean;
  selected:boolean;
  errorCode:string|null;
}
export interface R06MemoryView {
  memoryId:string;scopeKey:string;approved:boolean;
  text:string;expiresAt:string|null;revokedAt:string|null;
}
export interface R06ConversationView {
  scope:AuthenticatedScope;
  threadId:string;messages:readonly R06Message[];
  attachments:readonly R06Attachment[];
  currentTask:TaskState|null;
  draft:ReviewDraft|null;
  memories:readonly R06MemoryView[];
}
export type R06DocumentState='upload_pending'|'uploaded'|'parsing'|'partial'|
  'needs_review'|'ready_for_quotation'|'blocked';
export function r06DocumentState(source:R06Attachment):R06DocumentState{
  if(source.upload==='failed'||source.parse==='failed')return 'blocked';
  if(source.upload!=='uploaded')return 'upload_pending';
  if(source.parse==='not_started')return 'uploaded';
  if(source.parse==='parsing')return 'parsing';
  if(source.parse!=='parsed'||!source.coverage||source.coverage.status!=='complete')
    return 'partial';
  if(source.humanReview!=='verified'||!source.serverAuthorizedForQuotation)
    return 'needs_review';
  return 'ready_for_quotation';
}
export function r06DocumentLabel(status:R06DocumentState):string{
  const labels:Record<R06DocumentState,string>={
    upload_pending:'جاري الرفع أو بانتظاره',
    uploaded:'رُفع الملف — لم تُفحص محتوياته بعد',
    parsing:'جاري استخراج المحتوى',
    partial:'المحتوى جزئي أو غير مكتمل',
    needs_review:'بحاجة إلى مراجعة البيانات والمصدر',
    ready_for_quotation:'اجتاز فحص المصدر لهذا الغرض',
    blocked:'الملف متعذر المعالجة',
  };
  return labels[status];
}
export function r06ObservedProgress(task:TaskState|null):string|null{
  if(!task)return null;
  const {progress}=task;
  if(progress.totalUnits===null)
    return progress.completedUnits>0?
      'تم التحقق من '+progress.completedUnits+' '+progress.unitType:null;
  if(progress.completedUnits>progress.totalUnits)throw Error('R06_INVALID_PROGRESS');
  return progress.completedUnits+' / '+progress.totalUnits+' '+progress.unitType;
}
export function assertR06Scope(view:R06ConversationView,authorized:AuthenticatedScope):void{
  const key=exactScopeKey(authorized);
  if(exactScopeKey(view.scope)!==key||view.threadId!==authorized.threadId ||
    view.attachments.some(a=>a.scopeKey!==key)||
    view.memories.some(m=>m.scopeKey!==key)||
    (view.draft&&exactScopeKey(view.draft.scope)!==key)||
    (view.currentTask&&exactScopeKey(view.currentTask.scope)!==key))
    throw Error('R06_VIEW_SCOPE_MISMATCH');
}
export function r06VisibleMemories(view:R06ConversationView,now:string):R06MemoryView[]{
  const t=Date.parse(now);
  return view.memories.filter(m=>m.approved&&!m.revokedAt&&
    (!m.expiresAt||Date.parse(m.expiresAt)>t));
}
export function r06DraftBlockers(draft:ReviewDraft|null):string[]{
  if(!draft)return [];
  const issues=[...draft.businessValidation.blockers];
  if(draft.lineItems.length>R06_FINANCE_EDITOR_LINE_LIMIT)
    issues.push('EDITOR_120_LINES_LIMIT');
  if(draft.status!=='ready_for_approval')issues.push('REVIEW_REQUIRED');
  return [...new Set(issues)];
}
