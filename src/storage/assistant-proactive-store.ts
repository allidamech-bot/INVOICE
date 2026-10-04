import { getRecord, putRecord } from './db.js';

export type ProactiveCategory='info'|'opportunity'|'attention'|'urgent';
export interface ProactiveDismissal{key:string;at:string;}
export interface ProactiveSnooze{key:string;until:string;}
export interface ProactiveState{version:1;mutedCategories:ProactiveCategory[];dismissed:ProactiveDismissal[];snoozed:ProactiveSnooze[];morningBriefEnabled:boolean;updatedAt:string;}
interface EncryptedProactiveRecord{id:'assistant-proactive';version:1;iv:string;cipher:string;updatedAt:string;}
const RECORD_ID='assistant-proactive' as const,MAX_DISMISSED=240,MAX_SNOOZED=120;
function now():string{return new Date().toISOString();}
function safe(value:unknown,max=160):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function iso(value:unknown):string{const text=safe(value,48),ms=Date.parse(text);return text&&Number.isFinite(ms)?new Date(ms).toISOString():'';}
function bytesToB64(bytes:Uint8Array):string{let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(binary);}
function b64(value:string):ArrayBuffer{const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;}
function empty():ProactiveState{return{version:1,mutedCategories:[],dismissed:[],snoozed:[],morningBriefEnabled:true,updatedAt:now()};}
function category(value:unknown):ProactiveCategory|null{const text=safe(value,32);return text==='info'||text==='opportunity'||text==='attention'||text==='urgent'?text:null;}
export function normalizeProactiveState(value:any):ProactiveState{
  if(!value||value.version!==1)return empty();
  const categories=(Array.isArray(value.mutedCategories)?value.mutedCategories:[]).map(category).filter((row:ProactiveCategory|null):row is ProactiveCategory=>Boolean(row));
  const mutedCategories:ProactiveCategory[]=Array.from(new Set<ProactiveCategory>(categories)).slice(0,4);
  const dismissed:ProactiveDismissal[]=(Array.isArray(value.dismissed)?value.dismissed:[]).map((row:any)=>({key:safe(row?.key,180),at:iso(row?.at)})).filter((row:ProactiveDismissal)=>Boolean(row.key&&row.at)).sort((a:ProactiveDismissal,b:ProactiveDismissal)=>b.at.localeCompare(a.at)).slice(0,MAX_DISMISSED);
  const snoozed:ProactiveSnooze[]=(Array.isArray(value.snoozed)?value.snoozed:[]).map((row:any)=>({key:safe(row?.key,180),until:iso(row?.until)})).filter((row:ProactiveSnooze)=>Boolean(row.key&&row.until)).sort((a:ProactiveSnooze,b:ProactiveSnooze)=>b.until.localeCompare(a.until)).slice(0,MAX_SNOOZED);
  return{version:1,mutedCategories,dismissed,snoozed,morningBriefEnabled:value.morningBriefEnabled!==false,updatedAt:iso(value.updatedAt)||now()};
}
async function encrypt(key:CryptoKey,state:ProactiveState):Promise<EncryptedProactiveRecord>{const iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify(normalizeProactiveState(state))),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{id:RECORD_ID,version:1,iv:bytesToB64(iv),cipher:bytesToB64(cipher),updatedAt:now()};}
async function decrypt(key:CryptoKey,row:EncryptedProactiveRecord):Promise<ProactiveState>{if(row.version!==1||!row.iv||!row.cipher)throw new Error('Unsupported proactive assistant state.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(row.iv)},key,b64(row.cipher));return normalizeProactiveState(JSON.parse(new TextDecoder().decode(plain)));}
export async function loadProactiveState(key:CryptoKey):Promise<ProactiveState>{const row=await getRecord<any>(RECORD_ID as any) as EncryptedProactiveRecord|null;if(!row)return empty();try{return await decrypt(key,row);}catch{throw new Error('LOUREX proactive preferences could not be decrypted for this account.');}}
async function save(key:CryptoKey,state:ProactiveState):Promise<void>{state.updatedAt=now();await putRecord(await encrypt(key,state) as any);}
export async function dismissProactiveSignal(key:CryptoKey,signalKey:string):Promise<void>{const state=await loadProactiveState(key),target=safe(signalKey,180);if(!target)return;state.dismissed=[{key:target,at:now()},...state.dismissed.filter(row=>row.key!==target)].slice(0,MAX_DISMISSED);state.snoozed=state.snoozed.filter(row=>row.key!==target);await save(key,state);}
export async function snoozeProactiveSignal(key:CryptoKey,signalKey:string,until:string):Promise<void>{const state=await loadProactiveState(key),target=safe(signalKey,180),time=iso(until);if(!target||!time)throw new Error('A valid snooze time is required.');state.snoozed=[{key:target,until:time},...state.snoozed.filter(row=>row.key!==target)].slice(0,MAX_SNOOZED);await save(key,state);}
export async function setProactiveCategoryMuted(key:CryptoKey,value:ProactiveCategory,muted:boolean):Promise<void>{const state=await loadProactiveState(key),set=new Set<ProactiveCategory>(state.mutedCategories);if(muted)set.add(value);else set.delete(value);state.mutedCategories=[...set];await save(key,state);}
export async function setMorningBriefEnabled(key:CryptoKey,enabled:boolean):Promise<void>{const state=await loadProactiveState(key);state.morningBriefEnabled=Boolean(enabled);await save(key,state);}
export function proactiveSignalVisible(state:ProactiveState,input:{key:string;category:ProactiveCategory},at=Date.now()):boolean{if(state.mutedCategories.includes(input.category))return false;if(state.dismissed.some(row=>row.key===input.key))return false;const snooze=state.snoozed.find(row=>row.key===input.key);return !snooze||Date.parse(snooze.until)<=at;}
export function pruneProactiveState(state:ProactiveState,at=Date.now()):ProactiveState{const cutoff=at-90*24*60*60*1000;return{...state,dismissed:state.dismissed.filter(row=>Date.parse(row.at)>=cutoff),snoozed:state.snoozed.filter(row=>Date.parse(row.until)>at-7*24*60*60*1000)};}
