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

function safeText(value:unknown,max:number):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function now():string{return new Date().toISOString();}
function makeId(prefix:string):string{return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;}
function emptyState():AssistantStoreState{return{version:1,threads:[],currentBusinessThreadId:'',currentPersonalThreadId:'',updatedAt:now()};}
function bytesToB64(bytes:Uint8Array):string{let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(binary);}
function b64ToBytes(value:string):Uint8Array{const binary=atob(value);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
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
  const messages=Array.isArray(value.messages)?value.messages.map(normalizedMessage).filter((row):row is AssistantStoredMessage=>Boolean(row)).slice(-MAX_MESSAGES):[];
  const createdAt=safeText(value.createdAt,40)||now(),updatedAt=safeText(value.updatedAt,40)||createdAt;
  return{id,scope,title:safeText(value.title,100)||'LOUREX conversation',workspaceId:scope==='business'?safeText(value.workspaceId,120):'',branchId:scope==='business'?safeText(value.branchId,120):'',summary:safeText(value.summary,MAX_SUMMARY_CHARS),messages,createdAt,updatedAt};
}
export function normalizeAssistantState(value:any):AssistantStoreState{
  if(!value||typeof value!=='object'||value.version!==1)return emptyState();
  const threads=Array.isArray(value.threads)?value.threads.map(normalizedThread).filter((row):row is AssistantThread=>Boolean(row)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,MAX_THREADS):[];
  const currentBusinessThreadId=safeText(value.currentBusinessThreadId,120),currentPersonalThreadId=safeText(value.currentPersonalThreadId,120);
  return{version:1,threads,currentBusinessThreadId:threads.some(row=>row.id===currentBusinessThreadId&&row.scope==='business')?currentBusinessThreadId:'',currentPersonalThreadId:threads.some(row=>row.id===currentPersonalThreadId&&row.scope==='personal')?currentPersonalThreadId:'',updatedAt:safeText(value.updatedAt,40)||now()};
}
async function encryptState(key:CryptoKey,state:AssistantStoreState):Promise<EncryptedAssistantRecord>{
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=new TextEncoder().encode(JSON.stringify(state));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));
  return{id:RECORD_ID,version:1,iv:bytesToB64(iv),cipher:bytesToB64(cipher),updatedAt:now()};
}
async function decryptState(key:CryptoKey,record:EncryptedAssistantRecord):Promise<AssistantStoreState>{
  if(record.version!==1||!record.iv||!record.cipher)throw new Error('Unsupported LOUREX assistant history format.');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(record.iv)},key,b64ToBytes(record.cipher));
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
  const current=state.threads.find(row=>row.id===preferred&&scopeMatches(row,scope,workspaceId,branchId));
  return current??state.threads.find(row=>scopeMatches(row,scope,workspaceId,branchId))??null;
}
export function newAssistantThread(scope:Exclude<AssistantScope,'temporary'>,workspaceId:string,branchId:string,title=''):AssistantThread{
  const timestamp=now();return{id:makeId('ai-thread'),scope,title:safeText(title,100)||'New conversation',workspaceId:scope==='business'?safeText(workspaceId,120):'',branchId:scope==='business'?safeText(branchId,120):'',summary:'',messages:[],createdAt:timestamp,updatedAt:timestamp};
}
function titleFrom(messages:AssistantStoredMessage[],fallback:string):string{
  const first=messages.find(row=>row.role==='user')?.text||'';return safeText(first,64)||safeText(fallback,100)||'LOUREX conversation';
}
export function summarizeAssistantConversation(messages:MessageLike[]):string{
  const normalized=messages.map(normalizedMessage).filter((row):row is AssistantStoredMessage=>Boolean(row));
  if(normalized.length<=6)return'';
  return normalized.slice(0,-4).slice(-12).map(row=>`${row.role==='user'?'User':'Advisor'}: ${safeText(row.text,120)}`).join(' | ').slice(-MAX_SUMMARY_CHARS);
}
export function assistantProviderMemory(messages:MessageLike[],summary=''):string{
  const recent=messages.map(normalizedMessage).filter((row):row is AssistantStoredMessage=>Boolean(row)).slice(-2).map(row=>`${row.role==='user'?'User':'Advisor'}: ${safeText(row.text,150)}`).join('\n');
  const compactSummary=safeText(summary,260);
  return [compactSummary?`Earlier conversation summary: ${compactSummary}`:'',recent].filter(Boolean).join('\n').slice(-520);
}
export function upsertAssistantThread(state:AssistantStoreState,input:{threadId?:string;scope:Exclude<AssistantScope,'temporary'>;workspaceId:string;branchId:string;messages:MessageLike[]}):{state:AssistantStoreState;thread:AssistantThread}{
  const normalized=normalizeAssistantState(state);
  const requestedId=safeText(input.threadId,120);
  const existing=requestedId?normalized.threads.find(row=>row.id===requestedId&&scopeMatches(row,input.scope,input.workspaceId,input.branchId)):findAssistantThread(normalized,input.scope,input.workspaceId,input.branchId);
  const created=newAssistantThread(input.scope,input.workspaceId,input.branchId);
  const base=existing??(requestedId?{...created,id:requestedId}:created);
  const messages=input.messages.map(normalizedMessage).filter((row):row is AssistantStoredMessage=>Boolean(row)).slice(-MAX_MESSAGES);
  const thread:AssistantThread={...base,title:titleFrom(messages,base.title),summary:summarizeAssistantConversation(messages),messages,updatedAt:now()};
  const threads=[thread,...normalized.threads.filter(row=>row.id!==thread.id)].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,MAX_THREADS);
  const next:AssistantStoreState={version:1,threads,currentBusinessThreadId:input.scope==='business'?thread.id:normalized.currentBusinessThreadId,currentPersonalThreadId:input.scope==='personal'?thread.id:normalized.currentPersonalThreadId,updatedAt:now()};
  return{state:next,thread};
}
export async function persistAssistantThread(key:CryptoKey,input:{threadId?:string;scope:Exclude<AssistantScope,'temporary'>;workspaceId:string;branchId:string;messages:MessageLike[]}):Promise<AssistantThread>{
  const state=await loadAssistantState(key);const result=upsertAssistantThread(state,input);await saveAssistantState(key,result.state);return result.thread;
}
