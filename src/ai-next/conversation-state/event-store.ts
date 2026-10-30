/**
 * LOUREX AI Next R03 — isolated, append-only conversation event store.
 *
 * Security boundary: caller must resolve an AuthenticatedScope from a verified
 * SERVER identity before using this module; raw browser scope is untrusted.
 * No production routes or durable DB adapters are installed in R03.
 */
import type { AuthenticatedScope, TaskState, ConversationTurn } from '../domain/contracts.js';
import { assertCoreContract, validateAuthenticatedScope } from '../domain/validation.js';
import { exactScopeKey } from '../domain/turn-journal.js';
import { canTransition, transitionTask, type TransitionOptions } from '../domain/state-machine.js';

export type ConversationEventBody =
  | {kind:'turn_started'; turn:ConversationTurn; task:TaskState}
  | {kind:'task_updated'; task:TaskState}
  | {kind:'message'; messageId:string; turnId:string; role:'assistant'|'user'; text:string; sourceIds:string[]}
  | {kind:'checkpoint'; taskId:string; checkpointId:string; sourceIds:string[]; referenceHash:string; stage:string}
  | {kind:'uncertain_execution'; taskId:string; operationId:string; reasonCode:string};
export interface ConversationEvent {
  schemaVersion:1;
  eventId:string;
  sequence:number;
  scopeKey:string;
  eventAt:string;
  idempotencyKey:string;
  previousHash:string;
  hash:string;
  body:ConversationEventBody;
}
export interface ConversationSnapshot {
  schemaVersion:1;
  scopeKey:string;
  revision:number;
  lastHash:string;
  lastEventAt:string|null;
  turns:ConversationTurn[];
  tasks:TaskState[];
  messages:Array<{messageId:string;turnId:string;role:'assistant'|'user';text:string;sourceIds:string[]}>;
  checkpointRefs:Array<{taskId:string;checkpointId:string;sourceIds:string[];referenceHash:string;stage:string}>;
  uncertainOperations:Array<{taskId:string;operationId:string;reasonCode:string}>;
}
export interface JournalRecord {
  revision:number;
  events:ConversationEvent[];
}
export interface AtomicEventBackend {
  /**
   * REQUIRED for production implementation: serializable, atomic transactions
   * on the entire thread, incl. uniqueness and stateVersion CAS.
   * Callback must be executed exactly once under a per-thread lock.
   * Synthetic adapter below is IN-MEMORY, not cross-process durable.
   */
  transact<T>(
    threadKey:string,
    action:(record:JournalRecord)=>Promise<{next:JournalRecord;result:T}>
  ):Promise<T>;
  read(threadKey:string):Promise<JournalRecord>;
}
const clone=<T>(v:T):T=>structuredClone(v);
const isIso=(v:string):boolean=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v) &&
  !Number.isNaN(Date.parse(v));
const safeId=(v:string):boolean=>typeof v==='string'&&v.length>0&&v.length<=160&&
  !/[\u0000-\u001f\u007f]/u.test(v);
export const MAX_R03_EVENTS=20_000;
const EMPTY_HASH='0'.repeat(64);
const canonical=(v:unknown):string=>{
  if(v===null || typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
  if(typeof v==='number'&&Number.isFinite(v))return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v && typeof v==='object' && Object.getPrototypeOf(v)===Object.prototype)
    return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}';
  throw new Error('AI_NEXT_EVENT_NON_JSON');
};
async function digest(s:string):Promise<string>{
  const bytes=new TextEncoder().encode(s),owned=new Uint8Array(new ArrayBuffer(bytes.length));
  owned.set(bytes);
  const hash=await crypto.subtle.digest('SHA-256',owned);
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
function verifyBody(scope:AuthenticatedScope,body:ConversationEventBody):void{
  if(!body||typeof body!=='object'||!('kind' in body))throw new Error('AI_NEXT_INVALID_EVENT');
  switch(body.kind){
    case 'turn_started':
      assertCoreContract('ConversationTurn',body.turn);
      assertCoreContract('TaskState',body.task);
      if(exactScopeKey(body.turn.scope)!==exactScopeKey(scope) ||
        exactScopeKey(body.task.scope)!==exactScopeKey(scope) ||
        body.task.taskId!==body.turn.taskId || body.task.turnId!==body.turn.turnId ||
        body.turn.threadId!==scope.threadId)throw new Error('AI_NEXT_EVENT_SCOPE_MISMATCH');
      break;
    case 'task_updated':
      assertCoreContract('TaskState',body.task);
      if(exactScopeKey(body.task.scope)!==exactScopeKey(scope))throw new Error('AI_NEXT_EVENT_SCOPE_MISMATCH');
      break;
    case 'message':
      if(!safeId(body.messageId)||!safeId(body.turnId) ||
        !['user','assistant'].includes(body.role) ||
        typeof body.text!=='string'||body.text.length>100_000 ||
        !Array.isArray(body.sourceIds) || body.sourceIds.length>100 ||
        body.sourceIds.some(x=>!safeId(x)))throw new Error('AI_NEXT_INVALID_MESSAGE');
      break;
    case 'checkpoint':
      if(!safeId(body.checkpointId)||!safeId(body.taskId) ||
        !safeId(body.stage)||!Array.isArray(body.sourceIds)||
        body.sourceIds.some(x=>!safeId(x)) ||
        !/^[a-f0-9]{64}$/.test(body.referenceHash))
        throw new Error('AI_NEXT_INVALID_CHECKPOINT_REF');
      break;
    case 'uncertain_execution':
      if(!safeId(body.taskId)||!safeId(body.operationId)||!safeId(body.reasonCode))
        throw new Error('AI_NEXT_INVALID_OPERATION');
      break;
    default: throw new Error('AI_NEXT_UNKNOWN_EVENT_KIND');
  }
}
function baseSnapshot(key:string):ConversationSnapshot{return {
  schemaVersion:1,scopeKey:key,revision:0,lastHash:EMPTY_HASH,lastEventAt:null,
  turns:[],tasks:[],messages:[],checkpointRefs:[],uncertainOperations:[],
};}
/** Pure projection is deterministic: no model inference, no lost history or hidden windowing. */
export function projectEvents(scope:AuthenticatedScope,events:readonly ConversationEvent[]):ConversationSnapshot{
  const key=exactScopeKey(scope),snapshot=baseSnapshot(key);
  const seen=new Set<string>(),turns=new Set<string>(),messages=new Set<string>();
  for(const event of events){
    if(event.sequence!==snapshot.revision+1 || event.scopeKey!==key ||
      event.previousHash!==snapshot.lastHash || seen.has(event.idempotencyKey) ||
      !isIso(event.eventAt) || !/^[a-f0-9]{64}$/.test(event.hash))
      throw new Error('AI_NEXT_DAMAGED_EVENT_CHAIN');
    if(snapshot.lastEventAt && Date.parse(event.eventAt)<Date.parse(snapshot.lastEventAt))
      throw new Error('AI_NEXT_EVENT_TIME_REGRESSION');
    seen.add(event.idempotencyKey);
    verifyBody(scope,event.body);
    if(event.body.kind==='turn_started'){
      if(turns.has(event.body.turn.turnId) || event.body.task.state!=='created' ||
        event.body.task.stateVersion!==0 ||
        event.body.turn.sequenceNumber!==snapshot.turns.length+1 ||
        event.body.turn.parentTurnId!==(snapshot.turns.at(-1)?.turnId??null))
        throw new Error('AI_NEXT_INVALID_TURN_SEQUENCE');
      const active=snapshot.tasks.at(-1);
      if(active && !['completed','failed','cancelled'].includes(active.state))
        throw new Error('AI_NEXT_CONCURRENT_TURN');
      turns.add(event.body.turn.turnId);
      snapshot.turns.push(clone(event.body.turn));
      snapshot.tasks.push(clone(event.body.task));
    } else if(event.body.kind==='task_updated'){
      const prior=snapshot.tasks.find(t=>t.taskId===event.body.task.taskId);
      if(!prior || prior.turnId!==event.body.task.turnId ||
        prior.stateVersion+1!==event.body.task.stateVersion ||
        prior.revision+1!==event.body.task.revision)
        throw new Error('AI_NEXT_STALE_TASK_EVENT');
      const next=event.body.task;
      if(next.state==='executing' || !canTransition(prior.state,next.state) ||
        next.taskId!==prior.taskId || next.taskType!==prior.taskType ||
        next.startedAt!==prior.startedAt || next.threadId!==prior.threadId ||
        JSON.stringify(next.sourceIds)!==JSON.stringify(prior.sourceIds) ||
        Date.parse(next.updatedAt)<Date.parse(prior.updatedAt) ||
        (next.state==='completed' && !!next.sourceIds.length) ||
        (next.state==='completed' && !next.completedAt) ||
        (next.state==='needs_reconciliation' && !next.executionOperationId &&
          prior.state!=='executing'))
        throw new Error('AI_NEXT_UNAUTHORIZED_TASK_TRANSITION');
      snapshot.tasks[snapshot.tasks.indexOf(prior)]=clone(next);
    } else if(event.body.kind==='message'){
      if(messages.has(event.body.messageId) || !turns.has(event.body.turnId))
        throw new Error('AI_NEXT_MESSAGE_TURN_MISMATCH');
      messages.add(event.body.messageId);
      snapshot.messages.push(clone(event.body));
    } else if(event.body.kind==='checkpoint'){
      if(!snapshot.tasks.some(t=>t.taskId===event.body.taskId))
        throw new Error('AI_NEXT_CHECKPOINT_TASK_MISMATCH');
      snapshot.checkpointRefs.push(clone(event.body));
    } else if(event.body.kind==='uncertain_execution'){
      if(!snapshot.tasks.some(t=>t.taskId===event.body.taskId))
        throw new Error('AI_NEXT_OPERATION_TASK_MISMATCH');
      snapshot.uncertainOperations.push(clone(event.body));
    }
    snapshot.revision=event.sequence;snapshot.lastHash=event.hash;
    snapshot.lastEventAt=event.eventAt;
  }
  return snapshot;
}
/**
 * Immutable hashes detect corruption/accidental edits in a trusted backend;
 * they are NOT an HMAC or proof against an attacker with full store write access.
 */
async function verifyEventHashes(events:readonly ConversationEvent[]):Promise<void>{
  for(const event of events){
    const {hash,...unsigned}=event;
    if(await digest(canonical(unsigned))!==hash)
      throw new Error('AI_NEXT_DAMAGED_EVENT_HASH');
  }
}
export class SyntheticAtomicEventBackend implements AtomicEventBackend {
  private data=new Map<string,JournalRecord>();
  private locks=new Map<string,Promise<void>>();
  async transact<T>(key:string,action:(record:JournalRecord)=>
    Promise<{next:JournalRecord;result:T}>):Promise<T>{
    const previous=this.locks.get(key)??Promise.resolve();
    let unlock:()=>void=()=>{};
    const pending=new Promise<void>(resolve=>{unlock=resolve;});
    const lock=previous.then(()=>pending);
    this.locks.set(key,lock);
    await previous;
    try{
      const old=clone(this.data.get(key)??{revision:0,events:[]});
      const out=await action(old);
      if(out.next.revision!==out.next.events.length ||
        out.next.revision<old.revision || out.next.events.length>MAX_R03_EVENTS)
        throw new Error('AI_NEXT_INVALID_EVENT_TRANSACTION');
      this.data.set(key,clone(out.next));
      return clone(out.result);
    }finally{
      unlock();
      if(this.locks.get(key)===lock)this.locks.delete(key);
    }
  }
  async read(key:string):Promise<JournalRecord>{
    const pending=this.locks.get(key);if(pending)await pending;
    return clone(this.data.get(key)??{revision:0,events:[]});
  }
  /** Test-only: simulate persisted-bit corruption. Never an authorization API. */
  corruptForTest(key:string,transform:(r:JournalRecord)=>JournalRecord):void{
    this.data.set(key,transform(clone(this.data.get(key)??{revision:0,events:[]})));
  }
}
export class ScopedConversationLedger {
  constructor(private readonly backend:AtomicEventBackend){}
  async snapshot(scope:AuthenticatedScope):Promise<ConversationSnapshot>{
    const key=exactScopeKey(scope),record=await this.backend.read(key);
    if(record.revision!==record.events.length)throw new Error('AI_NEXT_INVALID_STORE_REVISION');
    await verifyEventHashes(record.events);
    return projectEvents(scope,record.events);
  }
  async append(input:{
    scope:AuthenticatedScope;
    expectedRevision:number;
    eventId:string;
    idempotencyKey:string;
    body:ConversationEventBody;
    now:string;
  }):Promise<{event:ConversationEvent;snapshot:ConversationSnapshot;replayed:boolean}>{
    const {scope,expectedRevision,eventId,idempotencyKey,now,body}=input;
    const key=exactScopeKey(scope);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0 ||
      !safeId(eventId)||!safeId(idempotencyKey)||!isIso(now))
      throw new Error('AI_NEXT_INVALID_APPEND_REQUEST');
    verifyBody(scope,body);
    return this.backend.transact(key,async record=>{
      if(record.revision!==record.events.length)throw new Error('AI_NEXT_INVALID_STORE_REVISION');
      await verifyEventHashes(record.events);
      const before=projectEvents(scope,record.events);
      if(record.events.some(e=>e.eventId===eventId && e.idempotencyKey!==idempotencyKey))
        throw new Error('AI_NEXT_DUPLICATE_EVENT_ID');
      const existing=record.events.find(e=>e.idempotencyKey===idempotencyKey);
      if(existing){
        if(canonical(existing.body)!==canonical(body) ||
          existing.eventId!==eventId)
          throw new Error('AI_NEXT_IDEMPOTENCY_COLLISION');
        return {next:record,result:{event:existing,snapshot:before,replayed:true}};
      }
      if(expectedRevision!==record.revision)throw new Error('AI_NEXT_STALE_EVENT_REVISION');
      if(record.events.length>=MAX_R03_EVENTS)throw new Error('AI_NEXT_EVENT_CAP_REACHED');
      if(before.lastEventAt && Date.parse(now)<Date.parse(before.lastEventAt))
        throw new Error('AI_NEXT_EVENT_TIME_REGRESSION');
      const unsigned={
        schemaVersion:1 as const,eventId,sequence:record.revision+1,scopeKey:key,
        eventAt:now,idempotencyKey,previousHash:before.lastHash,body:clone(body),
      };
      const event:ConversationEvent={...unsigned,hash:await digest(canonical(unsigned))};
      const next:JournalRecord={revision:record.revision+1,events:[...record.events,event]};
      const projected=projectEvents(scope,next.events);
      return {next,result:{event,snapshot:projected,replayed:false}};
    });
  }
  async transitionTask(input:{
    scope:AuthenticatedScope;taskId:string;expectedStateVersion:number;
    expectedRevision:number;nextState:TaskState['state'];eventId:string;
    idempotencyKey:string;now:string;options?:Omit<TransitionOptions,'now'|'expectedStateVersion'>;
  }):Promise<{snapshot:ConversationSnapshot;replayed:boolean}>{
    // Read+append race is safe: the append's expectedRevision is still CAS
    // checked inside the atomic backend transaction.
    const snapshot=await this.snapshot(input.scope);
    const task=snapshot.tasks.find(t=>t.taskId===input.taskId);
    if(!task)throw new Error('AI_NEXT_TASK_NOT_FOUND_OR_FORBIDDEN');
    if(input.expectedRevision!==snapshot.revision)
      throw new Error('AI_NEXT_STALE_EVENT_REVISION');
    const updated=transitionTask(task,input.nextState,{
      ...input.options,now:input.now,expectedStateVersion:input.expectedStateVersion,
    });
    const out=await this.append({
      scope:input.scope,expectedRevision:input.expectedRevision,eventId:input.eventId,
      idempotencyKey:input.idempotencyKey,now:input.now,body:{kind:'task_updated',task:updated},
    });
    return {snapshot:out.snapshot,replayed:out.replayed};
  }
}
