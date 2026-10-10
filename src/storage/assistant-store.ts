import { getRecord, putRecord } from './db.js';
import type { AssistantScope } from '../lib/ai-assistant-foundation.js';

export interface AssistantStoredMessage{id:string;role:'user'|'assistant';text:string;createdAt:string;}
export interface AssistantThread{
  id:string;
  scope:Exclude<AssistantScope,'temporary'>;
  title:string;
  workspaceId:string;
  branchId:string;
  summary:string;
  commercialSession?:unknown;
  messages:AssistantStoredMessage[];
  createdAt:string;
  updatedAt:string;
}
export interface AssistantStoreState{version:1;threads:AssistantThread[];currentBusinessThreadId:string;currentPersonalThreadId:string;updatedAt:string;}
interface EncryptedAssistantRecord{id:'assistant-state';version:1;iv:string;cipher:string;updatedAt:string;}
interface MessageLike{id?:string;role:'user'|'assistant';text:string;createdAt?:string;}

const RECORD_ID='assistant-state' as const;
const MAX_THREADS=30;
const MAX_MESSAGES=60;
const MAX_MESSAGE_CHARS=4000;
const MAX_SUMMARY_CHARS=1200;
const MAX_PROVIDER_MEMORY_CHARS=520;
const PROVIDER_SUMMARY_PREFIX='Earlier conversation summary: ';

function safeText(value:unknown,max:number):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function now():string{return new Date().toISOString();}
function makeId(prefix:string):string{return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;}
function emptyState():AssistantStoreState{return{version:1,threads:[],currentBusinessThreadId:'',currentPersonalThreadId:'',updatedAt:now()};}
function bytesToB64(bytes:Uint8Array):string{let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(binary);}
function b64ToArrayBuffer(value:string):ArrayBuffer{const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;}
function normalizedMessage(value:any):AssistantStoredMessage|null{
  if(!value||typeof value!=='object')return null;
  const role=value.role==='assistant'?'assistant':value.role==='user'?'user':null;
  const text=safeText(value.text,MAX_MESSAGE_CHARS);
  if(!role||!text)return null;
  return{id:safeText(value.id,120)||makeId(role),role,text,createdAt:safeText(value.createdAt,40)||now()};
}
function normalizedThread(value:any):AssistantThread|null{
  if(!value||typeof value!=='object')return null;
  const scope=value.scope==='personal'?'personal':value.scope==='business'?'business':null;
  const id=safeText(value.id,120);if(!scope||!id)return null;
  const messages:AssistantStoredMessage[]=Array.isArray(value.messages)?value.messages.map((row:any)=>normalizedMessage(row)).filter((row:AssistantStoredMessage|null):row is AssistantStoredMessage=>Boolean(row)).slice(-MAX_MESSAGES):[];
  const createdAt=safeText(value.createdAt,40)||now(),updatedAt=safeText(value.updatedAt,40)||createdAt;
  return{id,scope,title:safeText(value.title,100)||'LOUREX conversation',workspaceId:scope==='business'?safeText(value.workspaceId,120):'',branchId:scope==='business'?safeText(value.branchId,120):'',summary:safeText(value.summary,MAX_SUMMARY_CHARS),commercialSession:scope==='business'&&value.commercialSession&&JSON.stringify(value.commercialSession).length<=120000?value.commercialSession:undefined,messages,createdAt,updatedAt};
}
export function normalizeAssistantState(value:any):AssistantStoreState{
  if(!value||typeof value!=='object'||value.version!==1)return emptyState();
  const threads:AssistantThread[]=Array.isArray(value.threads)?value.threads.map((row:any)=>normalizedThread(row)).filter((row:AssistantThread|null):row is AssistantThread=>Boolean(row)).sort((a:AssistantThread,b:AssistantThread)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,MAX_THREADS):[];
  const currentBusinessThreadId=safeText(value.currentBusinessThreadId,120),currentPersonalThreadId=safeText(value.currentPersonalThreadId,120);
  return{version:1,threads,currentBusinessThreadId:threads.some((row:AssistantThread)=>row.id===currentBusinessThreadId&&row.scope==='business')?currentBusinessThreadId:'',currentPersonalThreadId:threads.some((row:AssistantThread)=>row.id===currentPersonalThreadId&&row.scope==='personal')?currentPersonalThreadId:'',updatedAt:safeText(value.updatedAt,40)||now()};
}
async function encryptState(key:CryptoKey,state:AssistantStoreState):Promise<EncryptedAssistantRecord>{
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=new TextEncoder().encode(JSON.stringify(state));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));
  return{id:RECORD_ID,version:1,iv:bytesToB64(iv),cipher:bytesToB64(cipher),updatedAt:now()};
}
async function decryptState(key:CryptoKey,record:EncryptedAssistantRecord):Promise<AssistantStoreState>{
  if(record.version!==1||!record.iv||!record.cipher)throw new Error('Unsupported LOUREX assistant history format.');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToArrayBuffer(record.iv)},key,b64ToArrayBuffer(record.cipher));
  return normalizeAssistantState(JSON.parse(new TextDecoder().decode(plain)));
}
export async function loadAssistantState(key:CryptoKey):Promise<AssistantStoreState>{
  const record=await getRecord<any>(RECORD_ID as any) as EncryptedAssistantRecord|null;
  if(!record)return emptyState();
  try{return await decryptState(key,record);}catch{throw new Error('LOUREX assistant history could not be decrypted for this account.');}
}
export async function saveAssistantState(key:CryptoKey,state:AssistantStoreState):Promise<void>{await putRecord(await encryptState(key,normalizeAssistantState(state)) as any);}

function scopeMatches(thread:AssistantThread,scope:Exclude<AssistantScope,'temporary'>,workspaceId:string,branchId:string):boolean{
  return thread.scope===scope&&(scope==='personal'||(thread.workspaceId===workspaceId&&thread.branchId===branchId));
}
export function findAssistantThread(state:AssistantStoreState,scope:Exclude<AssistantScope,'temporary'>,workspaceId:string,branchId:string):AssistantThread|null{
  const preferred=scope==='business'?state.currentBusinessThreadId:state.currentPersonalThreadId;
  const current=state.threads.find((row:AssistantThread)=>row.id===preferred&&scopeMatches(row,scope,workspaceId,branchId));
  return current??state.threads.find((row:AssistantThread)=>scopeMatches(row,scope,workspaceId,branchId))??null;
}
export function newAssistantThread(scope:Exclude<AssistantScope,'temporary'>,workspaceId:string,branchId:string,title=''):AssistantThread{
  const timestamp=now();return{id:makeId('ai-thread'),scope,title:safeText(title,100)||'New conversation',workspaceId:scope==='business'?safeText(workspaceId,120):'',branchId:scope==='business'?safeText(branchId,120):'',summary:'',messages:[],createdAt:timestamp,updatedAt:timestamp};
}
function titleFrom(messages:AssistantStoredMessage[],fallback:string):string{
  const first=messages.find((row:AssistantStoredMessage)=>row.role==='user')?.text||'';return safeText(first,64)||safeText(fallback,100)||'LOUREX conversation';
}
export function summarizeAssistantConversation(messages:MessageLike[]):string{
  const normalized:AssistantStoredMessage[]=messages.map((row:MessageLike)=>normalizedMessage(row)).filter((row:AssistantStoredMessage|null):row is AssistantStoredMessage=>Boolean(row));
  if(normalized.length<=6)return'';
  return normalized.slice(0,-4).slice(-12).map((row:AssistantStoredMessage)=>`${row.role==='user'?'User':'Advisor'}: ${safeText(row.text,120)}`).join(' | ').slice(-MAX_SUMMARY_CHARS);
}
export function assistantProviderMemory(messages:MessageLike[],summary=''):string{
  const recent=messages.map((row:MessageLike)=>normalizedMessage(row)).filter((row:AssistantStoredMessage|null):row is AssistantStoredMessage=>Boolean(row)).slice(-2).map((row:AssistantStoredMessage)=>`${row.role==='user'?'User':'Advisor'}: ${safeText(row.text,140)}`).join('\n');
  const separator=recent?'\n':'';
  const summaryBudget=Math.max(0,MAX_PROVIDER_MEMORY_CHARS-PROVIDER_SUMMARY_PREFIX.length-separator.length-recent.length);
  const compactSummary=safeText(summary,Math.min(260,summaryBudget));
  const parts=[compactSummary?`${PROVIDER_SUMMARY_PREFIX}${compactSummary}`:'',recent].filter(Boolean);
  return parts.join('\n').slice(0,MAX_PROVIDER_MEMORY_CHARS);
}
export function upsertAssistantThread(state:AssistantStoreState,input:{threadId?:string;scope:Exclude<AssistantScope,'temporary'>;workspaceId:string;branchId:string;messages:MessageLike[]}):{state:AssistantStoreState;thread:AssistantThread}{
  const normalized=normalizeAssistantState(state);
  const requestedId=safeText(input.threadId,120);
  const existing=requestedId?normalized.threads.find((row:AssistantThread)=>row.id===requestedId&&scopeMatches(row,input.scope,input.workspaceId,input.branchId)):findAssistantThread(normalized,input.scope,input.workspaceId,input.branchId);
  const created=newAssistantThread(input.scope,input.workspaceId,input.branchId);
  const base=existing??(requestedId?{...created,id:requestedId}:created);
  const messages:AssistantStoredMessage[]=input.messages.map((row:MessageLike)=>normalizedMessage(row)).filter((row:AssistantStoredMessage|null):row is AssistantStoredMessage=>Boolean(row)).slice(-MAX_MESSAGES);
  const thread:AssistantThread={...base,title:titleFrom(messages,base.title),summary:summarizeAssistantConversation(messages),messages,updatedAt:now()};
  const threads=[thread,...normalized.threads.filter((row:AssistantThread)=>row.id!==thread.id)].sort((a:AssistantThread,b:AssistantThread)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,MAX_THREADS);
  const next:AssistantStoreState={version:1,threads,currentBusinessThreadId:input.scope==='business'?thread.id:normalized.currentBusinessThreadId,currentPersonalThreadId:input.scope==='personal'?thread.id:normalized.currentPersonalThreadId,updatedAt:now()};
  return{state:next,thread};
}
export async function persistAssistantThread(key:CryptoKey,input:{threadId?:string;scope:Exclude<AssistantScope,'temporary'>;workspaceId:string;branchId:string;messages:MessageLike[]}):Promise<AssistantThread>{
  const state=await loadAssistantState(key);const result=upsertAssistantThread(state,input);await saveAssistantState(key,result.state);return result.thread;
}
