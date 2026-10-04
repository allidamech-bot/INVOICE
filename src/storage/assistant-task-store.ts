import { getRecord, putRecord } from './db.js';

export type AssistantTaskScope='business'|'personal';
export type AssistantTaskRecurrence='none'|'daily'|'weekly'|'monthly';
export type AssistantTaskCondition='none'|'document-not-converted'|'customer-unpaid'|'stock-below';
export interface AssistantTaskRecord{
  id:string;
  scope:AssistantTaskScope;
  workspaceId:string;
  branchId:string;
  title:string;
  notes:string;
  dueAt:string;
  recurrence:AssistantTaskRecurrence;
  conditionType:AssistantTaskCondition;
  conditionValue:string;
  timezone:string;
  relatedEntityType:string;
  relatedEntityId:string;
  sourceThreadId:string;
  sourceMessageId:string;
  status:'open'|'done';
  completedAt:string;
  snoozedUntil:string;
  createdAt:string;
  updatedAt:string;
}
interface AssistantTaskState{version:1;tasks:AssistantTaskRecord[];updatedAt:string;}
interface EncryptedTaskRecord{id:'assistant-tasks';version:1;iv:string;cipher:string;updatedAt:string;}
const RECORD_ID='assistant-tasks' as const,MAX_TASKS=240;
function safe(value:unknown,max:number):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function now():string{return new Date().toISOString();}
function id():string{return`ai-task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;}
function bytesToB64(bytes:Uint8Array):string{let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(binary);}
function b64(value:string):ArrayBuffer{const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;}
function empty():AssistantTaskState{return{version:1,tasks:[],updatedAt:now()};}
function iso(value:unknown):string{const text=safe(value,48);if(!text)return'';const timestamp=Date.parse(text);return Number.isFinite(timestamp)?new Date(timestamp).toISOString():'';}
function recurrence(value:unknown):AssistantTaskRecurrence{return(['daily','weekly','monthly'].includes(String(value))?String(value):'none') as AssistantTaskRecurrence;}
function condition(value:unknown):AssistantTaskCondition{return(['document-not-converted','customer-unpaid','stock-below'].includes(String(value))?String(value):'none') as AssistantTaskCondition;}
function normalizeTask(value:any):AssistantTaskRecord|null{
  if(!value||typeof value!=='object')return null;
  const taskId=safe(value.id,120),scope=value.scope==='personal'?'personal':value.scope==='business'?'business':null,title=safe(value.title,180);if(!taskId||!scope||!title)return null;
  const createdAt=iso(value.createdAt)||now(),isBusiness=scope==='business';
  return{id:taskId,scope,workspaceId:isBusiness?safe(value.workspaceId,120):'',branchId:isBusiness?safe(value.branchId,120):'',title,notes:safe(value.notes,1000),dueAt:iso(value.dueAt),recurrence:recurrence(value.recurrence),conditionType:condition(value.conditionType),conditionValue:safe(value.conditionValue,160),timezone:safe(value.timezone,80),relatedEntityType:isBusiness?safe(value.relatedEntityType,40):'',relatedEntityId:isBusiness?safe(value.relatedEntityId,120):'',sourceThreadId:safe(value.sourceThreadId,120),sourceMessageId:safe(value.sourceMessageId,120),status:value.status==='done'?'done':'open',completedAt:iso(value.completedAt),snoozedUntil:iso(value.snoozedUntil),createdAt,updatedAt:iso(value.updatedAt)||createdAt};
}
export function normalizeAssistantTasks(value:any):AssistantTaskState{const tasks:AssistantTaskRecord[]=Array.isArray(value?.tasks)?value.tasks.map(normalizeTask).filter((row:AssistantTaskRecord|null):row is AssistantTaskRecord=>Boolean(row)).sort((a:AssistantTaskRecord,b:AssistantTaskRecord)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,MAX_TASKS):[];return{version:1,tasks,updatedAt:iso(value?.updatedAt)||now()};}
async function encrypt(key:CryptoKey,state:AssistantTaskState):Promise<EncryptedTaskRecord>{const iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify(normalizeAssistantTasks(state))),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{id:RECORD_ID,version:1,iv:bytesToB64(iv),cipher:bytesToB64(cipher),updatedAt:now()};}
async function decrypt(key:CryptoKey,record:EncryptedTaskRecord):Promise<AssistantTaskState>{if(record.version!==1||!record.iv||!record.cipher)throw new Error('Unsupported assistant task format.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(record.iv)},key,b64(record.cipher));return normalizeAssistantTasks(JSON.parse(new TextDecoder().decode(plain)));}
export async function loadAssistantTasks(key:CryptoKey):Promise<AssistantTaskState>{const row=await getRecord<any>(RECORD_ID as any) as EncryptedTaskRecord|null;if(!row)return empty();try{return await decrypt(key,row);}catch{throw new Error('LOUREX assistant tasks could not be decrypted for this account.');}}
function belongs(row:AssistantTaskRecord,scope:AssistantTaskScope,workspaceId:string,branchId:string):boolean{return row.scope===scope&&(scope==='personal'||(row.workspaceId===workspaceId&&row.branchId===branchId));}
export function scopedAssistantTasks(state:AssistantTaskState,input:{scope:AssistantTaskScope;workspaceId?:string;branchId?:string;status?:'open'|'done'|'all';}):AssistantTaskRecord[]{const status=input.status??'open';return state.tasks.filter(row=>belongs(row,input.scope,input.workspaceId??'',input.branchId??'')&&(status==='all'||row.status===status)).sort((a:AssistantTaskRecord,b:AssistantTaskRecord)=>{const ad=a.snoozedUntil||a.dueAt||'9999',bd=b.snoozedUntil||b.dueAt||'9999';return ad.localeCompare(bd)||b.updatedAt.localeCompare(a.updatedAt);});}
export async function createAssistantTask(key:CryptoKey,input:{scope:AssistantTaskScope;workspaceId?:string;branchId?:string;title:string;notes?:string;dueAt?:string;recurrence?:AssistantTaskRecurrence;conditionType?:AssistantTaskCondition;conditionValue?:string;timezone?:string;relatedEntityType?:string;relatedEntityId?:string;sourceThreadId?:string;sourceMessageId?:string;}):Promise<AssistantTaskRecord>{
  const title=safe(input.title,180);if(!title)throw new Error('Task title is required.');const timestamp=now(),isBusiness=input.scope==='business';const task:AssistantTaskRecord={id:id(),scope:input.scope,workspaceId:isBusiness?safe(input.workspaceId,120):'',branchId:isBusiness?safe(input.branchId,120):'',title,notes:safe(input.notes,1000),dueAt:iso(input.dueAt),recurrence:recurrence(input.recurrence),conditionType:condition(input.conditionType),conditionValue:safe(input.conditionValue,160),timezone:safe(input.timezone,80),relatedEntityType:isBusiness?safe(input.relatedEntityType,40):'',relatedEntityId:isBusiness?safe(input.relatedEntityId,120):'',sourceThreadId:safe(input.sourceThreadId,120),sourceMessageId:safe(input.sourceMessageId,120),status:'open',completedAt:'',snoozedUntil:'',createdAt:timestamp,updatedAt:timestamp};const state=await loadAssistantTasks(key),next={version:1 as const,tasks:[task,...state.tasks].slice(0,MAX_TASKS),updatedAt:timestamp};await putRecord(await encrypt(key,next) as any);return task;
}
export async function updateAssistantTask(key:CryptoKey,taskId:string,patch:{title?:string;notes?:string;dueAt?:string;recurrence?:AssistantTaskRecurrence;conditionType?:AssistantTaskCondition;conditionValue?:string;timezone?:string;}):Promise<AssistantTaskRecord>{const state=await loadAssistantTasks(key),index=state.tasks.findIndex(row=>row.id===safe(taskId,120));if(index<0)throw new Error('Task no longer exists.');const current=state.tasks[index]!,timestamp=now(),title=patch.title===undefined?current.title:safe(patch.title,180);if(!title)throw new Error('Task title is required.');const row:AssistantTaskRecord={...current,title,notes:patch.notes===undefined?current.notes:safe(patch.notes,1000),dueAt:patch.dueAt===undefined?current.dueAt:iso(patch.dueAt),recurrence:patch.recurrence===undefined?current.recurrence:recurrence(patch.recurrence),conditionType:patch.conditionType===undefined?current.conditionType:condition(patch.conditionType),conditionValue:patch.conditionValue===undefined?current.conditionValue:safe(patch.conditionValue,160),timezone:patch.timezone===undefined?current.timezone:safe(patch.timezone,80),updatedAt:timestamp};state.tasks=[...state.tasks.slice(0,index),row,...state.tasks.slice(index+1)];state.updatedAt=timestamp;await putRecord(await encrypt(key,state) as any);return row;}
function nextDue(dueAt:string,rule:AssistantTaskRecurrence):string{if(!dueAt||rule==='none')return'';const date=new Date(dueAt);if(Number.isNaN(date.getTime()))return'';if(rule==='daily')date.setUTCDate(date.getUTCDate()+1);else if(rule==='weekly')date.setUTCDate(date.getUTCDate()+7);else date.setUTCMonth(date.getUTCMonth()+1);return date.toISOString();}
export async function completeAssistantTask(key:CryptoKey,taskId:string):Promise<AssistantTaskRecord>{const state=await loadAssistantTasks(key),index=state.tasks.findIndex(row=>row.id===safe(taskId,120));if(index<0)throw new Error('Task no longer exists.');const current=state.tasks[index]!,timestamp=now(),next=nextDue(current.dueAt,current.recurrence),row:AssistantTaskRecord=next?{...current,status:'open',dueAt:next,snoozedUntil:'',completedAt:timestamp,updatedAt:timestamp}:{...current,status:'done',snoozedUntil:'',completedAt:timestamp,updatedAt:timestamp};state.tasks=[...state.tasks.slice(0,index),row,...state.tasks.slice(index+1)];state.updatedAt=timestamp;await putRecord(await encrypt(key,state) as any);return row;}
export async function setAssistantTaskStatus(key:CryptoKey,taskId:string,status:'open'|'done'):Promise<void>{if(status==='done'){await completeAssistantTask(key,taskId);return;}const state=await loadAssistantTasks(key),timestamp=now(),tasks=state.tasks.map((row:AssistantTaskRecord)=>row.id===taskId?{...row,status:'open' as const,completedAt:'',updatedAt:timestamp}:row);await putRecord(await encrypt(key,{version:1,tasks,updatedAt:timestamp}) as any);}
export async function snoozeAssistantTask(key:CryptoKey,taskId:string,until:string):Promise<AssistantTaskRecord>{const state=await loadAssistantTasks(key),index=state.tasks.findIndex(row=>row.id===safe(taskId,120));if(index<0)throw new Error('Task no longer exists.');const value=iso(until);if(!value)throw new Error('A valid snooze time is required.');const timestamp=now(),row:AssistantTaskRecord={...state.tasks[index]!,snoozedUntil:value,updatedAt:timestamp};state.tasks=[...state.tasks.slice(0,index),row,...state.tasks.slice(index+1)];state.updatedAt=timestamp;await putRecord(await encrypt(key,state) as any);return row;}
export async function deleteAssistantTask(key:CryptoKey,taskId:string):Promise<void>{const state=await loadAssistantTasks(key),target=safe(taskId,120),before=state.tasks.length;state.tasks=state.tasks.filter(row=>row.id!==target);if(state.tasks.length===before)throw new Error('Task no longer exists.');state.updatedAt=now();await putRecord(await encrypt(key,state) as any);}
export function dueAssistantTasks(state:AssistantTaskState,input:{scope:AssistantTaskScope;workspaceId?:string;branchId?:string;at?:string;}):AssistantTaskRecord[]{const at=Date.parse(input.at??now());return scopedAssistantTasks(state,{...input,status:'open'}).filter(row=>{const due=Date.parse(row.snoozedUntil||row.dueAt);return Number.isFinite(due)&&due<=at;});}
export function assistantTasksProviderText(state:AssistantTaskState,input:{scope:AssistantTaskScope;workspaceId?:string;branchId?:string;limit?:number;}):string{return scopedAssistantTasks(state,{scope:input.scope,workspaceId:input.workspaceId,branchId:input.branchId,status:'open'}).slice(0,Math.max(1,Math.min(10,input.limit??5))).map(row=>`${row.title}${row.dueAt?` @ ${row.dueAt}`:''}${row.recurrence!=='none'?` (${row.recurrence})`:''}`).join(' | ').slice(0,600);}
