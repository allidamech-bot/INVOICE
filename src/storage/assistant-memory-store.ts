import { getRecord, putRecord } from './db.js';

export type AssistantMemoryScope='business'|'personal';
export type AssistantMemoryKind='preference'|'fact'|'note'|'goal';
export type AssistantMemorySource='manual'|'user-approved'|'assistant-approved';
export interface AssistantMemoryRecord{
  id:string;
  scope:AssistantMemoryScope;
  workspaceId:string;
  branchId:string;
  kind:AssistantMemoryKind;
  content:string;
  source:AssistantMemorySource;
  sourceThreadId:string;
  createdAt:string;
  updatedAt:string;
  lastConfirmedAt:string;
  expiresAt:string;
  active:boolean;
}
export interface AssistantMemoryState{version:1;personalMemoryEnabled:boolean;records:AssistantMemoryRecord[];updatedAt:string;}
interface EncryptedMemoryRecord{id:'assistant-memory';version:1;iv:string;cipher:string;updatedAt:string;}

const RECORD_ID='assistant-memory' as const;
const MAX_RECORDS=160;
const MAX_CONTENT=700;
const STOPWORDS=new Set(['the','and','for','with','this','that','from','have','your','you','are','was','were','into','about','على','من','في','إلى','الى','عن','هذا','هذه','مع','انا','أنا','هو','هي','كان','تكون','يكون','شو','ما']);
function now():string{return new Date().toISOString();}
function safe(value:unknown,max:number):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function makeId():string{return`ai-memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;}
function bytesToB64(bytes:Uint8Array):string{let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(binary);}
function b64(value:string):ArrayBuffer{const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;}
function empty():AssistantMemoryState{return{version:1,personalMemoryEnabled:true,records:[],updatedAt:now()};}
function dateOrEmpty(value:unknown):string{const text=safe(value,40);return text&&!Number.isNaN(Date.parse(text))?new Date(text).toISOString():'';}
function normalizeRecord(value:any):AssistantMemoryRecord|null{
  if(!value||typeof value!=='object')return null;
  const id=safe(value.id,120),scope=value.scope==='personal'?'personal':value.scope==='business'?'business':null,content=safe(value.content,MAX_CONTENT);
  if(!id||!scope||!content)return null;
  const createdAt=dateOrEmpty(value.createdAt)||now(),kind=(['preference','fact','note','goal'].includes(value.kind)?value.kind:'note') as AssistantMemoryKind,source=(['manual','user-approved','assistant-approved'].includes(value.source)?value.source:'user-approved') as AssistantMemorySource;
  return{id,scope,workspaceId:scope==='business'?safe(value.workspaceId,120):'',branchId:scope==='business'?safe(value.branchId,120):'',kind,content,source,sourceThreadId:safe(value.sourceThreadId,120),createdAt,updatedAt:dateOrEmpty(value.updatedAt)||createdAt,lastConfirmedAt:dateOrEmpty(value.lastConfirmedAt)||createdAt,expiresAt:dateOrEmpty(value.expiresAt),active:value.active!==false};
}
export function normalizeAssistantMemory(value:any):AssistantMemoryState{
  if(!value||typeof value!=='object'||value.version!==1)return empty();
  const records:AssistantMemoryRecord[]=Array.isArray(value.records)?value.records.map(normalizeRecord).filter((row:AssistantMemoryRecord|null):row is AssistantMemoryRecord=>Boolean(row)).sort((a:AssistantMemoryRecord,b:AssistantMemoryRecord)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,MAX_RECORDS):[];
  return{version:1,personalMemoryEnabled:value.personalMemoryEnabled!==false,records,updatedAt:dateOrEmpty(value.updatedAt)||now()};
}
async function encrypt(key:CryptoKey,state:AssistantMemoryState):Promise<EncryptedMemoryRecord>{const iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify(normalizeAssistantMemory(state))),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{id:RECORD_ID,version:1,iv:bytesToB64(iv),cipher:bytesToB64(cipher),updatedAt:now()};}
async function decrypt(key:CryptoKey,row:EncryptedMemoryRecord):Promise<AssistantMemoryState>{if(row.version!==1||!row.iv||!row.cipher)throw new Error('Unsupported assistant memory format.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(row.iv)},key,b64(row.cipher));return normalizeAssistantMemory(JSON.parse(new TextDecoder().decode(plain)));}
export async function loadAssistantMemory(key:CryptoKey):Promise<AssistantMemoryState>{const row=await getRecord<any>(RECORD_ID as any) as EncryptedMemoryRecord|null;if(!row)return empty();try{return await decrypt(key,row);}catch{throw new Error('LOUREX assistant memory could not be decrypted for this account.');}}
export async function saveAssistantMemory(key:CryptoKey,state:AssistantMemoryState):Promise<void>{await putRecord(await encrypt(key,state) as any);}
function belongs(record:AssistantMemoryRecord,scope:AssistantMemoryScope,workspaceId:string,branchId:string):boolean{return record.scope===scope&&(scope==='personal'||(record.workspaceId===workspaceId&&record.branchId===branchId));}
function current(record:AssistantMemoryRecord,at=Date.now()):boolean{return record.active&&(!record.expiresAt||Date.parse(record.expiresAt)>at);}
export function scopedAssistantMemories(state:AssistantMemoryState,scope:AssistantMemoryScope,workspaceId='',branchId='',includeInactive=false):AssistantMemoryRecord[]{if(scope==='personal'&&!state.personalMemoryEnabled)return[];return state.records.filter(row=>belongs(row,scope,workspaceId,branchId)&&(includeInactive||current(row)));}
export async function createAssistantMemory(key:CryptoKey,input:{scope:AssistantMemoryScope;workspaceId?:string;branchId?:string;kind?:AssistantMemoryKind;content:string;source?:AssistantMemorySource;sourceThreadId?:string;expiresAt?:string;}):Promise<AssistantMemoryRecord>{
  const content=safe(input.content,MAX_CONTENT);if(!content)throw new Error('Memory content is required.');const state=await loadAssistantMemory(key);if(input.scope==='personal'&&!state.personalMemoryEnabled)throw new Error('Personal memory is disabled.');const timestamp=now(),record:AssistantMemoryRecord={id:makeId(),scope:input.scope,workspaceId:input.scope==='business'?safe(input.workspaceId,120):'',branchId:input.scope==='business'?safe(input.branchId,120):'',kind:input.kind??'note',content,source:input.source??'user-approved',sourceThreadId:safe(input.sourceThreadId,120),createdAt:timestamp,updatedAt:timestamp,lastConfirmedAt:timestamp,expiresAt:dateOrEmpty(input.expiresAt),active:true};state.records=[record,...state.records].slice(0,MAX_RECORDS);state.updatedAt=timestamp;await saveAssistantMemory(key,state);return record;
}
export async function updateAssistantMemory(key:CryptoKey,id:string,patch:{content?:string;kind?:AssistantMemoryKind;expiresAt?:string;active?:boolean;confirm?:boolean;}):Promise<AssistantMemoryRecord>{const state=await loadAssistantMemory(key),index=state.records.findIndex(row=>row.id===safe(id,120));if(index<0)throw new Error('Memory no longer exists.');const currentRow=state.records[index]!,timestamp=now(),content=patch.content===undefined?currentRow.content:safe(patch.content,MAX_CONTENT);if(!content)throw new Error('Memory content is required.');const row:AssistantMemoryRecord={...currentRow,content,kind:patch.kind??currentRow.kind,expiresAt:patch.expiresAt===undefined?currentRow.expiresAt:dateOrEmpty(patch.expiresAt),active:patch.active??currentRow.active,updatedAt:timestamp,lastConfirmedAt:patch.confirm?timestamp:currentRow.lastConfirmedAt};state.records=[...state.records.slice(0,index),row,...state.records.slice(index+1)];state.updatedAt=timestamp;await saveAssistantMemory(key,state);return row;}
export async function deleteAssistantMemory(key:CryptoKey,id:string):Promise<void>{const state=await loadAssistantMemory(key),target=safe(id,120),before=state.records.length;state.records=state.records.filter(row=>row.id!==target);if(state.records.length===before)throw new Error('Memory no longer exists.');state.updatedAt=now();await saveAssistantMemory(key,state);}
export async function setPersonalMemoryEnabled(key:CryptoKey,enabled:boolean):Promise<void>{const state=await loadAssistantMemory(key);state.personalMemoryEnabled=Boolean(enabled);state.updatedAt=now();await saveAssistantMemory(key,state);}
function tokens(text:string):Set<string>{return new Set(safe(text,1000).toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(token=>token.length>=2&&!STOPWORDS.has(token)).slice(0,40));}
export function relevantAssistantMemories(state:AssistantMemoryState,input:{scope:AssistantMemoryScope;workspaceId?:string;branchId?:string;query?:string;limit?:number;}):AssistantMemoryRecord[]{const rows=scopedAssistantMemories(state,input.scope,input.workspaceId??'',input.branchId??'');const query=tokens(input.query??'');return rows.map(row=>{const rowTokens=tokens(row.content);let score=0;for(const token of query)if(rowTokens.has(token))score+=3;for(const token of query)if(row.content.toLocaleLowerCase().includes(token))score+=1;if(row.kind==='preference')score+=1;return{row,score};}).sort((a:{row:AssistantMemoryRecord;score:number},b:{row:AssistantMemoryRecord;score:number})=>b.score-a.score||b.row.lastConfirmedAt.localeCompare(a.row.lastConfirmedAt)||b.row.updatedAt.localeCompare(a.row.updatedAt)).slice(0,Math.max(1,Math.min(12,input.limit??6))).map(item=>item.row);}
export function assistantMemoryProviderText(state:AssistantMemoryState,input:{scope:AssistantMemoryScope;workspaceId?:string;branchId?:string;query?:string;limit?:number;}):string{return relevantAssistantMemories(state,input).map(row=>`[${row.kind}] ${safe(row.content,180)}`).join(' | ').slice(0,650);}
