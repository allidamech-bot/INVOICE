/**
 * R07A bounded Firestore-compatible event backend, isolated and NOT deployed.
 *
 * An injected privileged SERVER Firestore client is required. No frontend path
 * can instantiate this backend with application credentials. R03's ledger must
 * still receive a fresh server-authorized scope on EVERY request.
 *
 * IMPORTANT: this is a transactional feasibility adapter, not approved
 * production storage. One-document-per-thread is intentionally bounded and
 * does NOT solve long-term event sharding, 100+ turn retention, object storage,
 * encrypted backup, or account-level quotas. Never activate as-is.
 */
import type {AtomicEventBackend,JournalRecord} from '../conversation-state/event-store.js';
import {MAX_R03_EVENTS} from '../conversation-state/event-store.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import type {AuthenticatedScope} from '../domain/contracts.js';

export const R07_PRODUCTION_STORAGE_ACTIVATED=false as const;
export const R07_MAX_THREAD_BYTES=700_000;
export const R07_MAX_THREAD_EVENTS=300;
const COLLECTION='aiNextEventThreadsV1';
type JsonRecord=Record<string,unknown>;
type Document={
  schemaVersion:number;
  scopeKey:string;
  revision:number;
  lastHash:string;
  events:JournalRecord['events'];
};
export interface R07DocumentSnapshot {
  exists:boolean;
  data():JsonRecord|undefined;
}
export interface R07DocumentReference {
  get():Promise<R07DocumentSnapshot>;
}
export interface R07FirestoreTransaction {
  get(ref:R07DocumentReference):Promise<R07DocumentSnapshot>;
  set(ref:R07DocumentReference,document:Document):void;
}
export interface R07FirestoreClient {
  collection(collectionName:string):{doc(id:string):R07DocumentReference};
  runTransaction<T>(work:(transaction:R07FirestoreTransaction)=>Promise<T>):Promise<T>;
}
export class R07StorageError extends Error {
  constructor(readonly code:string){super(code);}
}
const clone=<T>(value:T):T=>structuredClone(value);
const empty=():JournalRecord=>({revision:0,events:[]});

function validatedKey(key:string):void{
  let scope:AuthenticatedScope;
  try{
    const values=JSON.parse(key);
    if(!Array.isArray(values)||values.length!==9||
      values.some(v=>typeof v==='object'||typeof v==='function'))
      throw Error('bad key');
    const [ownerUid,accountId,companyId,branchId,threadId,actorId,
      role,scopeType,authorizationVersion]=values;
    scope={ownerUid,accountId,companyId,branchId,threadId,actorId,
      role,scopeType,authorizationVersion};
    if(exactScopeKey(scope)!==key)throw Error('noncanonical');
  }catch{
    throw new R07StorageError('R07_SCOPE_KEY_INVALID');
  }
}
async function docId(key:string):Promise<string>{
  const bytes=new TextEncoder().encode(key);
  const buf=new Uint8Array(bytes);
  const hash=await crypto.subtle.digest('SHA-256',buf);
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
function decode(snapshot:R07DocumentSnapshot,expectedKey:string):JournalRecord{
  if(!snapshot.exists)return empty();
  const body=snapshot.data();
  if(!body||body.schemaVersion!==1||body.scopeKey!==expectedKey||
    !Number.isSafeInteger(body.revision)||Number(body.revision)<0||
    !Array.isArray(body.events)||body.revision!==body.events.length||
    body.events.length>R07_MAX_THREAD_EVENTS||
    typeof body.lastHash!=='string'||!/^[a-f0-9]{64}$/.test(body.lastHash))
    throw new R07StorageError('R07_STORED_RECORD_INVALID');
  const events=body.events as JournalRecord['events'];
  if((events.at(-1)?.hash??'0'.repeat(64))!==body.lastHash)
    throw new R07StorageError('R07_STORED_LAST_HASH_MISMATCH');
  return clone({revision:body.revision as number,events});
}
function bounded(key:string,record:JournalRecord):Document{
  if(!Number.isSafeInteger(record.revision)||record.revision<0||
    record.revision!==record.events.length||
    record.events.length>R07_MAX_THREAD_EVENTS||
    record.events.length>MAX_R03_EVENTS)
    throw new R07StorageError('R07_EVENT_COUNT_CAP');
  const lastHash=record.events.at(-1)?.hash??'0'.repeat(64);
  if(!/^[a-f0-9]{64}$/.test(lastHash))
    throw new R07StorageError('R07_INVALID_EVENT_HASH');
  const document:Document={schemaVersion:1,scopeKey:key,
    revision:record.revision,lastHash,events:clone(record.events)};
  if(new TextEncoder().encode(JSON.stringify(document)).byteLength>R07_MAX_THREAD_BYTES)
    throw new R07StorageError('R07_DOCUMENT_SIZE_CAP');
  return document;
}
function equalBaseline(a:JournalRecord,b:JournalRecord):boolean{
  // Compare full content, not just revision: detect same-revision tampering.
  // Source auth/cryptographic verification is enforced separately by R03.
  return a.revision===b.revision&&JSON.stringify(a.events)===JSON.stringify(b.events);
}
/**
 * Executes the R03 domain callback ONCE, outside Firestore's automatically
 * retryable transaction callback. Inside the DB transaction, only compare
 * the authoritative baseline and commit the precomputed next state. A
 * concurrent update yields a safe conflict instead of re-running domain logic.
 */
export class R07ExperimentalFirestoreEventBackend implements AtomicEventBackend {
  constructor(private readonly database:R07FirestoreClient){}
  private async ref(key:string):Promise<R07DocumentReference>{
    validatedKey(key);
    return this.database.collection(COLLECTION).doc(await docId(key));
  }
  async read(key:string):Promise<JournalRecord>{
    const ref=await this.ref(key);
    return decode(await ref.get(),key);
  }
  async transact<T>(key:string,action:(record:JournalRecord)=>
    Promise<{next:JournalRecord;result:T}>):Promise<T>{
    const ref=await this.ref(key);
    const before=decode(await ref.get(),key);
    // This is invoked just once even if SDK retries runTransaction.
    const prepared=await action(clone(before));
    if(!prepared||!prepared.next||typeof prepared.next!=='object')
      throw new R07StorageError('R07_INVALID_TRANSACTION_RESULT');
    if(prepared.next.revision<before.revision)
      throw new R07StorageError('R07_REVISION_REGRESSION');
    if(prepared.next.revision===before.revision){
      if(!equalBaseline(before,prepared.next))
        throw new R07StorageError('R07_ILLEGAL_NOOP');
      // A strict no-op (idempotency replay) cannot write or charge a mutation.
      // Verify baseline didn't change before returning a safe replay result.
      await this.database.runTransaction(async tx=>{
        const latest=decode(await tx.get(ref),key);
        if(!equalBaseline(before,latest))
          throw new R07StorageError('R07_CONCURRENT_REVISION_CONFLICT');
      });
      return clone(prepared.result);
    }
    // Exactly one appended event per R03 append; no hidden branch rewrite.
    if(prepared.next.revision!==before.revision+1||
      JSON.stringify(prepared.next.events.slice(0,before.events.length))!==
        JSON.stringify(before.events))
      throw new R07StorageError('R07_INVALID_APPEND_ONLY_TRANSITION');
    const next=bounded(key,prepared.next);
    await this.database.runTransaction(async tx=>{
      const latest=decode(await tx.get(ref),key);
      if(!equalBaseline(before,latest))
        throw new R07StorageError('R07_CONCURRENT_REVISION_CONFLICT');
      tx.set(ref,next);
    });
    return clone(prepared.result);
  }
}
