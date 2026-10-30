/**
 * R07F — inactive server-only, consent-aware memory CAS adapter.
 * Does not automatically promote conversation text into memory.
 * Actual Firestore IAM, deployed security rules, retention and deletion
 * compliance must be independently approved before production activation.
 */
import type {AuthenticatedScope} from '../domain/contracts.js';
import {
  knowledgeScopeKey,
  type AtomicKnowledgeBackend,type KnowledgeCollection,type KnowledgeRecord,
} from '../conversation-state/knowledge.js';

export const R07F_PRODUCTION_MEMORY_STORAGE_ACTIVATED=false as const;
export const R07F_MEMORY_COLLECTION='aiNextConsentedMemoryV1';
export const R07F_MAX_MEMORY_BYTES=850_000;
const HASH=/^[a-f0-9]{64}$/u;
const copy=<T>(value:T):T=>structuredClone(value);
export class R07FMemoryStorageError extends Error{
  constructor(readonly code:string){super(code);}
}
export interface R07FMemorySnapshot{exists:boolean;data():unknown}
export interface R07FMemoryRef{get():Promise<R07FMemorySnapshot>}
export interface R07FMemoryTransaction{
  get(ref:R07FMemoryRef):Promise<R07FMemorySnapshot>;
  set(ref:R07FMemoryRef,value:StoredMemory):void;
}
export interface R07FMemoryFirestore{
  collection(name:string):{doc(id:string):R07FMemoryRef};
  runTransaction<T>(work:(tx:R07FMemoryTransaction)=>Promise<T>):Promise<T>;
}
interface StoredMemory{
  schemaVersion:1;scopeKey:string;revision:number;
  contentHash:string;records:KnowledgeRecord[];
}
const isPlain=(x:unknown):x is Record<string,unknown>=>!!x&&
  typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;
const id=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&
  x.length<=160&&!/[\u0000-\u001f\u007f]/u.test(x);
const iso=(x:unknown):x is string=>typeof x==='string'&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(x)&&
  !Number.isNaN(Date.parse(x));
const canonical=(x:unknown):string=>{
  if(x===null||typeof x==='string'||typeof x==='boolean')return JSON.stringify(x);
  if(typeof x==='number'&&Number.isFinite(x))return JSON.stringify(x);
  if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
  if(isPlain(x))return '{'+Object.keys(x).sort()
    .map(key=>JSON.stringify(key)+':'+canonical(x[key])).join(',')+'}';
  throw new R07FMemoryStorageError('R07F_NON_JSON_DATA');
};
async function hash(x:unknown):Promise<string>{
  const bytes=new TextEncoder().encode(canonical(x));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
function ensureKey(key:string):string{
  try{
    const parts=JSON.parse(key);
    if(!Array.isArray(parts)||parts.length!==8)throw Error('bad');
    const [ownerUid,accountId,companyId,branchId,actorId,role,
      scopeType,authorizationVersion]=parts;
    const scope:AuthenticatedScope={
      ownerUid,accountId,companyId,branchId,actorId,role,scopeType,
      authorizationVersion,threadId:'memory-scope-verification',
    };
    if(knowledgeScopeKey(scope)!==key)throw Error('not canonical');
    return actorId;
  }catch{throw new R07FMemoryStorageError('R07F_INVALID_MEMORY_SCOPE');}
}
function validRecord(row:KnowledgeRecord,key:string,actor:string):boolean{
  return !!row&&row.schemaVersion===1&&row.ownerKey===key&&
    id(row.memoryId)&&['preference','fact','goal','note'].includes(row.kind)&&
    id(row.sourceThreadId)&&id(row.sourceTurnId)&&
    (row.sourceDocumentId===null||id(row.sourceDocumentId))&&
    id(row.consentId)&&row.approvedByActorId===actor&&
    iso(row.createdAt)&&iso(row.expiresAt)&&
    Date.parse(row.expiresAt)>Date.parse(row.createdAt)&&
    Number.isSafeInteger(row.version)&&row.version>=1&&
    (row.revokedAt===null
      ? typeof row.content==='string'&&row.content.trim().length>0&&
        row.content.length<=3000
      : iso(row.revokedAt)&&row.content===null&&
        Date.parse(row.revokedAt)>=Date.parse(row.createdAt));
}
function validate(key:string,record:KnowledgeCollection):void{
  const actor=ensureKey(key);
  if(!record||!Number.isSafeInteger(record.revision)||record.revision<0||
    !Array.isArray(record.records)||record.records.length>200)
    throw new R07FMemoryStorageError('R07F_INVALID_RECORD');
  const ids=new Set<string>();
  for(const entry of record.records){
    if(!validRecord(entry,key,actor)||ids.has(entry.memoryId))
      throw new R07FMemoryStorageError('R07F_INVALID_CONSENT_RECORD');
    ids.add(entry.memoryId);
  }
}
function validateTransition(before:KnowledgeCollection,next:KnowledgeCollection):void{
  if(next.revision!==before.revision+1||
    next.records.length<before.records.length||
    next.records.length>before.records.length+1)
    throw new R07FMemoryStorageError('R07F_INVALID_MEMORY_REVISION');
  let changes=0;
  for(let index=0;index<before.records.length;index++){
    const prev=before.records[index]!,updated=next.records[index]!;
    if(prev.memoryId!==updated.memoryId)
      throw new R07FMemoryStorageError('R07F_REORDER_OR_DELETE_FORBIDDEN');
    if(canonical(prev)===canonical(updated))continue;
    changes++;
    if(changes>1||prev.revokedAt!==null||updated.revokedAt===null||
      updated.content!==null||updated.version!==prev.version+1||
      !iso(updated.revokedAt)||Date.parse(updated.revokedAt)<Date.parse(prev.createdAt)||
      canonical({...prev,content:null,revokedAt:updated.revokedAt,
        version:prev.version+1})!==canonical(updated))
      throw new R07FMemoryStorageError('R07F_CONSENT_REWRITE_FORBIDDEN');
  }
  if(next.records.length===before.records.length+1){
    if(changes||next.records.at(-1)?.version!==1||
      next.records.at(-1)?.revokedAt!==null)
      throw new R07FMemoryStorageError('R07F_NOT_NEW_CONSENT_RECORD');
  }
}
function bound(key:string,record:KnowledgeCollection,contentHash:string):StoredMemory{
  const document:StoredMemory={
    schemaVersion:1,scopeKey:key,revision:record.revision,
    contentHash,records:copy(record.records),
  };
  if(new TextEncoder().encode(JSON.stringify(document)).length>R07F_MAX_MEMORY_BYTES)
    throw new R07FMemoryStorageError('R07F_MEMORY_SIZE_CAP');
  return document;
}
async function decode(snapshot:R07FMemorySnapshot,key:string):Promise<KnowledgeCollection>{
  if(!snapshot.exists)return {revision:0,records:[]};
  const raw=snapshot.data();
  if(!isPlain(raw)||Object.keys(raw).sort().join('|')!==
    ['schemaVersion','scopeKey','revision','contentHash','records'].sort().join('|')||
    raw.schemaVersion!==1||raw.scopeKey!==key||
    !HASH.test(String(raw.contentHash))||
    !Number.isSafeInteger(raw.revision)||!Array.isArray(raw.records))
    throw new R07FMemoryStorageError('R07F_STORED_DOCUMENT_INVALID');
  const collection={revision:raw.revision as number,
    records:raw.records as KnowledgeRecord[]};
  validate(key,collection);
  if(await hash(collection)!==raw.contentHash)
    throw new R07FMemoryStorageError('R07F_MEMORY_HASH_MISMATCH');
  bound(key,collection,raw.contentHash as string);
  return copy(collection);
}
async function docId(key:string):Promise<string>{
  ensureKey(key);
  return hash(key);
}
export class R07FExperimentalFirestoreKnowledgeBackend implements AtomicKnowledgeBackend{
  constructor(private readonly database:R07FMemoryFirestore){}
  private async ref(key:string):Promise<R07FMemoryRef>{
    return this.database.collection(R07F_MEMORY_COLLECTION).doc(await docId(key));
  }
  async read(key:string):Promise<KnowledgeCollection>{
    const ref=await this.ref(key);
    return decode(await ref.get(),key);
  }
  async transact<T>(key:string,fn:(current:KnowledgeCollection)=>
    Promise<{next:KnowledgeCollection;result:T}>):Promise<T>{
    const ref=await this.ref(key);
    const baseline=await decode(await ref.get(),key);
    // Domain callback runs ONCE outside Firestore's retryable transaction.
    const prepared=await fn(copy(baseline));
    if(!prepared||!prepared.next)
      throw new R07FMemoryStorageError('R07F_INVALID_TRANSACTION_RESULT');
    validate(key,prepared.next);
    validateTransition(baseline,prepared.next);
    const next=bound(key,prepared.next,await hash(prepared.next));
    await this.database.runTransaction(async tx=>{
      const latest=await decode(await tx.get(ref),key);
      if(canonical(latest)!==canonical(baseline))
        throw new R07FMemoryStorageError('R07F_CONCURRENT_MEMORY_REVISION');
      tx.set(ref,next);
    });
    return copy(prepared.result);
  }
}
