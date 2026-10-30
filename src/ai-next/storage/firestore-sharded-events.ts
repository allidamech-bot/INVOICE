/**
 * R07G — ISOLATED sharded, append-only Firestore event feasibility backend.
 *
 * This is a replacement candidate for the R07A 300-event single document,
 * NOT a migration of R07A and NOT an active backend. Production server IAM,
 * membership, retention, quotas, real Firestore transactions, restore and
 * long-thread latency remain separate release gates.
 *
 * Immutable historical chunks + one bounded mutable tail chunk are committed
 * together with a compact thread head in ONE Firestore transaction. The R03
 * domain callback runs exactly once OUTSIDE the SDK's retrying transaction.
 */
import type {AuthenticatedScope} from '../domain/contracts.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {MAX_R03_EVENTS,type AtomicEventBackend,
  type ConversationEvent,type JournalRecord} from '../conversation-state/event-store.js';

export const R07G_PRODUCTION_SHARDED_STORAGE_ACTIVATED=false as const;
export const R07G_COLLECTION='aiNextEventShardsV1';
export const R07G_CHUNK_EVENTS=96;
export const R07G_CHUNK_BYTES=650_000;
export const R07G_MAX_CHUNKS=1024;
export const R07G_HEAD_BYTES=250_000;
const HASH=/^[a-f0-9]{64}$/;
const ZERO='0'.repeat(64);
const clone=<T>(x:T):T=>structuredClone(x);
const size=(x:unknown):number=>new TextEncoder().encode(JSON.stringify(x)).length;
const empty=():JournalRecord=>({revision:0,events:[]});
export class R07GStorageError extends Error {
  constructor(readonly code:string){super(code);}
}
type ShardDescriptor={
  index:number;start:number;end:number;
  previousHash:string;lastHash:string;contentHash:string;
};
type ShardHead={
  schemaVersion:1;scopeKey:string;revision:number;lastHash:string;
  chunks:ShardDescriptor[];
};
type ShardChunk={
  schemaVersion:1;scopeKey:string;index:number;start:number;
  events:ConversationEvent[];
};
export interface R07GSnapshot{exists:boolean;data():unknown}
export interface R07GDocumentRef{get():Promise<R07GSnapshot>}
export interface R07GTransaction{
  get(ref:R07GDocumentRef):Promise<R07GSnapshot>;
  set(ref:R07GDocumentRef,data:ShardHead|ShardChunk):void;
  create(ref:R07GDocumentRef,data:ShardHead|ShardChunk):void;
}
export interface R07GFirestoreClient{
  collection(name:string):{doc(id:string):R07GDocumentRef};
  runTransaction<T>(action:(tx:R07GTransaction)=>Promise<T>):Promise<T>;
}
const isPlain=(x:unknown):x is Record<string,unknown>=>!!x&&
  typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;
const exactKeys=(x:Record<string,unknown>,keys:string[]):boolean=>
  Object.keys(x).sort().join('|')===keys.sort().join('|');
function validateScopeKey(key:string):void{
  try{
    const a=JSON.parse(key);
    if(!Array.isArray(a)||a.length!==9)throw Error('bad key');
    const [ownerUid,accountId,companyId,branchId,threadId,actorId,
      role,scopeType,authorizationVersion]=a;
    const s:AuthenticatedScope={ownerUid,accountId,companyId,branchId,
      threadId,actorId,role,scopeType,authorizationVersion};
    if(exactScopeKey(s)!==key)throw Error('noncanonical');
  }catch{throw new R07GStorageError('R07G_INVALID_SCOPE_KEY');}
}
async function digest(value:string):Promise<string>{
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
async function hashEvents(events:ConversationEvent[]):Promise<string>{
  return digest(JSON.stringify(events));
}
async function refs(db:R07GFirestoreClient,key:string){
  validateScopeKey(key);
  const id=await digest(key),col=db.collection(R07G_COLLECTION);
  return {
    head:col.doc(id+':head'),
    chunk:(index:number)=>col.doc(id+':chunk:'+String(index).padStart(5,'0')),
  };
}
function validHead(data:unknown,key:string):ShardHead|null{
  if(data===undefined||data===null)return null;
  if(!isPlain(data)||!exactKeys(data,[
    'schemaVersion','scopeKey','revision','lastHash','chunks',
  ])||data.schemaVersion!==1||data.scopeKey!==key||
    typeof data.revision!=='number'||
    !Number.isSafeInteger(data.revision)||data.revision<1||
    data.revision>MAX_R03_EVENTS||
    typeof data.lastHash!=='string'||!HASH.test(data.lastHash)||
    !Array.isArray(data.chunks)||!data.chunks.length||
    data.chunks.length>R07G_MAX_CHUNKS||size(data)>R07G_HEAD_BYTES)
    throw new R07GStorageError('R07G_INVALID_HEAD');
  let end=0,hash=ZERO;
  for(let i=0;i<data.chunks.length;i++){
    const d=data.chunks[i];
    if(!isPlain(d)||!exactKeys(d,[
      'index','start','end','previousHash','lastHash','contentHash',
    ])||d.index!==i||d.start!==end+1||
      !Number.isSafeInteger(d.end)||d.end<d.start||
      d.end-d.start+1>R07G_CHUNK_EVENTS||
      d.previousHash!==hash||
      typeof d.lastHash!=='string'||!HASH.test(d.lastHash)||
      typeof d.contentHash!=='string'||!HASH.test(d.contentHash))
      throw new R07GStorageError('R07G_INVALID_HEAD_CHAIN');
    end=d.end;hash=d.lastHash;
  }
  if(end!==data.revision||hash!==data.lastHash)
    throw new R07GStorageError('R07G_HEAD_REVISION_MISMATCH');
  return clone(data as unknown as ShardHead);
}
function parseHead(snapshot:R07GSnapshot,key:string):ShardHead|null{
  return snapshot.exists?validHead(snapshot.data(),key):null;
}
async function checkChunk(snapshot:R07GSnapshot,key:string,
  descriptor:ShardDescriptor):Promise<ConversationEvent[]>{
  const raw=snapshot.exists?snapshot.data():null;
  if(!isPlain(raw)||!exactKeys(raw,[
    'schemaVersion','scopeKey','index','start','events',
  ])||raw.schemaVersion!==1||raw.scopeKey!==key||
    raw.index!==descriptor.index||raw.start!==descriptor.start||
    !Array.isArray(raw.events)||
    raw.events.length!==descriptor.end-descriptor.start+1||
    raw.events.length>R07G_CHUNK_EVENTS||
    size(raw)>R07G_CHUNK_BYTES)
    throw new R07GStorageError('R07G_MISSING_OR_CORRUPT_CHUNK');
  const events=raw.events as ConversationEvent[];
  let prior=descriptor.previousHash;
  for(let offset=0;offset<events.length;offset++){
    const e=events[offset];
    if(!isPlain(e)||e.sequence!==descriptor.start+offset||
      e.scopeKey!==key||e.previousHash!==prior||
      typeof e.hash!=='string'||!HASH.test(e.hash))
      throw new R07GStorageError('R07G_DAMAGED_CHUNK_CHAIN');
    prior=e.hash;
  }
  if(prior!==descriptor.lastHash||
    await hashEvents(events)!==descriptor.contentHash)
    throw new R07GStorageError('R07G_CHUNK_HASH_MISMATCH');
  return clone(events);
}
async function descriptor(index:number,start:number,events:ConversationEvent[],
  previousHash:string):Promise<ShardDescriptor>{
  if(!events.length||events.length>R07G_CHUNK_EVENTS)
    throw new R07GStorageError('R07G_INVALID_CHUNK_LENGTH');
  return {index,start,end:start+events.length-1,previousHash,
    lastHash:events.at(-1)!.hash,contentHash:await hashEvents(events)};
}
function equal(a:unknown,b:unknown):boolean{return JSON.stringify(a)===JSON.stringify(b);}
function validateTransition(before:JournalRecord,next:JournalRecord){
  if(!next||!Array.isArray(next.events)||
    !Number.isSafeInteger(next.revision)||
    next.revision!==before.revision+1||
    next.revision!==next.events.length||
    next.revision>MAX_R03_EVENTS||
    !equal(next.events.slice(0,-1),before.events))
    throw new R07GStorageError('R07G_NOT_SINGLE_APPEND');
  const newEvent=next.events.at(-1);
  if(!newEvent||newEvent.sequence!==next.revision||
    typeof newEvent.hash!=='string'||!HASH.test(newEvent.hash)||
    newEvent.previousHash!==(before.events.at(-1)?.hash??ZERO))
    throw new R07GStorageError('R07G_INVALID_NEW_EVENT');
}
export class R07GExperimentalShardedEventBackend implements AtomicEventBackend{
  constructor(private readonly db:R07GFirestoreClient){}
  private async stableRead(key:string):Promise<{
    record:JournalRecord;head:ShardHead|null;tail:ShardChunk|null;
  }>{
    const ref=await refs(this.db,key);
    // Re-read head after chunks. Concurrent writer either yields a consistent
    // snapshot or safe retry; never silently return a mixed old/new history.
    for(let attempt=0;attempt<3;attempt++){
      const head=parseHead(await ref.head.get(),key);
      if(!head)return {record:empty(),head:null,tail:null};
      const events:ConversationEvent[]=[];
      let lastTail:ShardChunk|null=null;
      for(let offset=0;offset<head.chunks.length;offset+=8){
        const slice=head.chunks.slice(offset,offset+8);
        const raw=await Promise.all(slice.map(d=>ref.chunk(d.index).get()));
        for(let i=0;i<slice.length;i++){
          const d=slice[i]!,rows=await checkChunk(raw[i]!,key,d);
          events.push(...rows);
          if(offset+i===head.chunks.length-1){
            lastTail={schemaVersion:1,scopeKey:key,index:d.index,
              start:d.start,events:clone(rows)};
          }
        }
      }
      const latest=parseHead(await ref.head.get(),key);
      if(!equal(head,latest))continue;
      if(events.length!==head.revision||
        events.at(-1)?.hash!==head.lastHash)
        throw new R07GStorageError('R07G_INCOMPLETE_HISTORY');
      return {record:{revision:head.revision,events},head,tail:lastTail};
    }
    throw new R07GStorageError('R07G_UNSTABLE_CONCURRENT_READ');
  }
  async read(key:string):Promise<JournalRecord>{
    return (await this.stableRead(key)).record;
  }
  async transact<T>(key:string,action:(record:JournalRecord)=>
    Promise<{next:JournalRecord;result:T}>):Promise<T>{
    const ref=await refs(this.db,key);
    const before=await this.stableRead(key);
    // Never invoke domain callback in a Firestore transaction retried by SDK.
    const prepared=await action(clone(before.record));
    if(!prepared||!prepared.next)
      throw new R07GStorageError('R07G_INVALID_TRANSACTION');
    const changed=prepared.next.revision!==before.record.revision;
    if(!changed){
      if(!equal(before.record,prepared.next))
        throw new R07GStorageError('R07G_ILLEGAL_NOOP');
    }else validateTransition(before.record,prepared.next);
    let nextHead:ShardHead|null=null;
    let nextTail:ShardChunk|null=null;
    let newShard=false;
    if(changed){
      const event=prepared.next.events.at(-1)!;
      const head=before.head;
      const tail=before.tail;
      if(tail&&tail.events.length<R07G_CHUNK_EVENTS){
        const candidate:ShardChunk={...tail,events:[...tail.events,clone(event)]};
        if(size(candidate)<=R07G_CHUNK_BYTES){
          nextTail=candidate;
        }
      }
      if(!nextTail){
        const index=head?.chunks.length??0;
        if(index>=R07G_MAX_CHUNKS)
          throw new R07GStorageError('R07G_THREAD_SHARD_BUDGET_EXCEEDED');
        const candidate:ShardChunk={schemaVersion:1,scopeKey:key,
          index,start:prepared.next.revision,events:[clone(event)]};
        if(size(candidate)>R07G_CHUNK_BYTES)
          throw new R07GStorageError('R07G_SINGLE_EVENT_TOO_LARGE');
        nextTail=candidate;newShard=true;
      }
      const previousHash=newShard?(head?.lastHash??ZERO):
        (head!.chunks.at(-1)!.previousHash);
      const d=await descriptor(nextTail.index,nextTail.start,
        nextTail.events,previousHash);
      const previousDescriptors=head?.chunks??[];
      const chunks=newShard?[...previousDescriptors,d]:
        [...previousDescriptors.slice(0,-1),d];
      nextHead={schemaVersion:1,scopeKey:key,
        revision:prepared.next.revision,lastHash:d.lastHash,chunks};
      validHead(nextHead,key);
    }
    await this.db.runTransaction(async tx=>{
      const current=parseHead(await tx.get(ref.head),key);
      if(!equal(current,before.head))
        throw new R07GStorageError('R07G_CONCURRENT_REVISION_CONFLICT');
      if(before.head&&before.tail){
        const last=before.head.chunks.at(-1)!;
        const snapshot=await tx.get(ref.chunk(last.index));
        await checkChunk(snapshot,key,last);
        if(!equal(snapshot.data(),before.tail))
          throw new R07GStorageError('R07G_CONCURRENT_TAIL_MISMATCH');
      }
      if(!changed)return;
      if(!nextTail||!nextHead)
        throw new R07GStorageError('R07G_MISSING_PREPARED_APPEND');
      const tailRef=ref.chunk(nextTail.index);
      if(newShard){
        if((await tx.get(tailRef)).exists)
          throw new R07GStorageError('R07G_SHARD_ID_COLLISION');
        tx.create(tailRef,nextTail);
      }else tx.set(tailRef,nextTail);
      if(before.head)tx.set(ref.head,nextHead);
      else tx.create(ref.head,nextHead);
    });
    return clone(prepared.result);
  }
}
