import {activeAccountStorageUid} from '../storage/db.js';
import {currentCloudUser} from '../cloud/firebase.js';

export type AiJobStatus='processing'|'needs-review'|'completed'|'failed'|'cancelled';
export interface AiJobHistoryEntry{
  id:string;
  sourceName:string;
  documentType:string;
  route:string;
  status:AiJobStatus;
  createdAt:string;
  updatedAt:string;
  note:string;
}

const LEGACY_KEY='lourex-ai-job-history-v1';
const KEY_PREFIX='lourex-ai-job-history-v2:';
/** Jobs include filenames; never show a previous user's jobs after a UID switch.
 * The old global session key cannot be reliably attributed to any account,
 * so it is discarded rather than migrated into the currently logged-in user. */
function currentJobKey():string|null{
  const uid=activeAccountStorageUid();
  // Firebase identity can change before IndexedDB finishes switching scopes.
  // Never read, clear or write filenames under a stale local account UID.
  if(!uid||currentCloudUser()?.uid!==uid)return null;
  return KEY_PREFIX+encodeURIComponent(uid);
}
function discardLegacyUnscopedHistory():void{
  try{sessionStorage.removeItem(LEGACY_KEY);}catch{}
}
const MAX=30;

function safeText(value:unknown,max=180):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function validStatus(value:unknown):value is AiJobStatus{return['processing','needs-review','completed','failed','cancelled'].includes(String(value));}
function normalizeEntry(value:any):AiJobHistoryEntry|null{
  if(!value||typeof value!=='object')return null;const id=safeText(value.id,120),status=value.status;if(!id||!validStatus(status))return null;
  return{id,sourceName:safeText(value.sourceName),documentType:safeText(value.documentType,80),route:safeText(value.route,60),status,createdAt:safeText(value.createdAt,40),updatedAt:safeText(value.updatedAt,40),note:safeText(value.note,220)};
}
export function readAiJobHistory():AiJobHistoryEntry[]{
  discardLegacyUnscopedHistory();
  const key=currentJobKey();if(!key)return[];
  try{const parsed=JSON.parse(sessionStorage.getItem(key)||'[]');return Array.isArray(parsed)?parsed.map(normalizeEntry).filter((row):row is AiJobHistoryEntry=>Boolean(row)).slice(0,MAX):[];}catch{return[];}
}
function write(entries:AiJobHistoryEntry[]):void{
  discardLegacyUnscopedHistory();
  const key=currentJobKey();if(!key)return;
  try{sessionStorage.setItem(key,JSON.stringify(entries.slice(0,MAX)));}catch{}
}
export function startAiJob(sourceName:string):AiJobHistoryEntry{
  const now=new Date().toISOString();const entry:AiJobHistoryEntry={id:`ai-job-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,sourceName:safeText(sourceName)||'AI source',documentType:'',route:'',status:'processing',createdAt:now,updatedAt:now,note:''};write([entry,...readAiJobHistory().filter(row=>row.id!==entry.id)]);return entry;
}
/** Reuse only an active review; a failed/cancelled/completed workflow
 * cannot be retried by mutating its final history row. A fresh manual attempt
 * gets a new, UID-scoped job identity while preserving the previous outcome. */
export function activeOrFreshAiJob(id:string,sourceName:string):AiJobHistoryEntry{
  const existing=id?readAiJobHistory().find(row=>row.id===id):undefined;
  return existing&&(existing.status==='processing'||existing.status==='needs-review')
    ?existing:startAiJob(sourceName);
}
export function updateAiJob(id:string,patch:Partial<Pick<AiJobHistoryEntry,'documentType'|'route'|'status'|'note'>>):AiJobHistoryEntry|null{
  const rows=readAiJobHistory();const index=rows.findIndex(row=>row.id===id);if(index<0)return null;const current=rows[index]!;
  // A stale provider callback must not turn a cancelled, failed or completed
  // job back into a reviewable operation. Retry always starts a fresh job ID.
  // Preserve its last confirmed terminal note and timestamp as well.
  if(['completed','failed','cancelled'].includes(current.status)&&
     patch.status!==undefined&&patch.status!==current.status)return current;
  const next:AiJobHistoryEntry={...current,documentType:patch.documentType===undefined?current.documentType:safeText(patch.documentType,80),route:patch.route===undefined?current.route:safeText(patch.route,60),status:patch.status&&validStatus(patch.status)?patch.status:current.status,note:patch.note===undefined?current.note:safeText(patch.note,220),updatedAt:new Date().toISOString()};rows[index]=next;write(rows);return next;
}
export function clearAiJobHistory():void{discardLegacyUnscopedHistory();const key=currentJobKey();if(!key)return;try{sessionStorage.removeItem(key);}catch{}}
