/**
 * R07J — experimental indexed append journal with constant-size Firestore
 * reads for *each append* (not full-history projection on every write).
 *
 * Completely separate from R07G; no backfill, migration or live API route.
 * Only a trusted server-authorized scope may reach this Admin SDK adapter.
 * Every event and uniqueness receipt is atomically committed with the head.
 * Full event replay remains available for recovery/audit and may be expensive.
 */
import type {AuthenticatedScope,TaskState} from '../domain/contracts.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {assertCoreContract} from '../domain/validation.js';
import {canTransition} from '../domain/state-machine.js';
import {
  MAX_R03_EVENTS,projectEvents,sealConversationEvent,verifySealedEvent,
  type ConversationEvent,type ConversationEventBody,type ConversationSnapshot,
} from '../conversation-state/event-store.js';

export const R07J_INDEXED_APPEND_ACTIVE=false as const;
export const R07J_COLLECTION='aiNextIndexedEventThreadsV1';
export const R07J_MAX_HEAD_BYTES=12_000;
export const R07J_MAX_EVENT_BYTES=220_000;
const ZERO='0'.repeat(64);
const HASH=/^[0-9a-f]{64}$/;
const clone=<T>(v:T):T=>structuredClone(v);
const size=(v:unknown):number=>new TextEncoder().encode(JSON.stringify(v)).length;
const plain=(x:unknown):x is Record<string,unknown>=>
  x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;
const canonical=(value:unknown):string=>{
  if(value===null||typeof value==='string'||typeof value==='boolean')
    return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(plain(value))return '{'+Object.keys(value).sort().map(k=>
    JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  throw new R07JStorageError('R07J_NON_CANONICAL_VALUE');
};
const equal=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
async function sha256(input:string):Promise<string>{
  const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
  return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,'0')).join('');
}
export class R07JStorageError extends Error{
  constructor(readonly code:string){super(code);}
}
interface Head{
  schemaVersion:1;scopeKey:string;revision:number;lastHash:string;
  lastEventAt:string|null;turnCount:number;lastTurnId:string|null;
  lastTaskId:string|null;lastTaskState:TaskState['state']|null;
}
interface TurnRef{schemaVersion:1;scopeKey:string;turnId:string;taskId:string;sequenceNumber:number}
interface TaskRef{schemaVersion:1;scopeKey:string;task:TaskState}
interface IdRef{schemaVersion:1;scopeKey:string;eventId:string;sequence:number}
interface MessageRef{schemaVersion:1;scopeKey:string;messageId:string;sequence:number}
interface Receipt{schemaVersion:1;scopeKey:string;event:ConversationEvent}
type Document=Head|TurnRef|TaskRef|IdRef|MessageRef|Receipt|ConversationEvent;
export interface R07JDocumentSnapshot{exists:boolean;data():unknown}
export interface R07JDocumentRef{get():Promise<R07JDocumentSnapshot>}
export interface R07JTransaction{
  get(ref:R07JDocumentRef):Promise<R07JDocumentSnapshot>;
  create(ref:R07JDocumentRef,data:Document):void;
  set(ref:R07JDocumentRef,data:Document):void;
}
export interface R07JFirestoreClient{
  collection(name:string):{doc(id:string):R07JDocumentRef};
  runTransaction<T>(action:(tx:R07JTransaction)=>Promise<T>):Promise<T>;
}
function parseHead(snapshot:R07JDocumentSnapshot,key:string):Head|null{
  if(!snapshot.exists)return null;
  const x=snapshot.data();
  if(!plain(x)||Object.keys(x).sort().join('|')!==[
    'schemaVersion','scopeKey','revision','lastHash','lastEventAt',
    'turnCount','lastTurnId','lastTaskId','lastTaskState',
  ].sort().join('|')||x.schemaVersion!==1||x.scopeKey!==key||
    !Number.isSafeInteger(x.revision)||(x.revision as number)<1||
    (x.revision as number)>MAX_R03_EVENTS||
    typeof x.lastHash!=='string'||!HASH.test(x.lastHash)||
    typeof x.lastEventAt!=='string'||Number.isNaN(Date.parse(x.lastEventAt))||
    !Number.isSafeInteger(x.turnCount)||(x.turnCount as number)<1||
    (x.turnCount as number)>(x.revision as number)||
    typeof x.lastTurnId!=='string'||typeof x.lastTaskId!=='string'||
    typeof x.lastTaskState!=='string'||size(x)>R07J_MAX_HEAD_BYTES)
    throw new R07JStorageError('R07J_INVALID_HEAD');
  return clone(x as unknown as Head);
}
function blank(key:string):Head{return{
  schemaVersion:1,scopeKey:key,revision:0,lastHash:ZERO,lastEventAt:null,
  turnCount:0,lastTurnId:null,lastTaskId:null,lastTaskState:null,
};}
function identity(input:unknown,key:string,field:string):void{
  if(!plain(input)||input.schemaVersion!==1||input.scopeKey!==key||
    typeof input[field]!=='string')
    throw new R07JStorageError('R07J_INVALID_INDEX');
}
const iso=(x:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)&&
  !Number.isNaN(Date.parse(x));
function verifyStateTransition(before:TaskState,next:TaskState):void{
  if(next.taskId!==before.taskId||next.turnId!==before.turnId||
    next.stateVersion!==before.stateVersion+1||
    next.revision!==before.revision+1)
    throw new R07JStorageError('R07J_STALE_TASK_EVENT');
  if(next.state==='executing'||!canTransition(before.state,next.state)||
    next.taskType!==before.taskType||next.startedAt!==before.startedAt||
    next.threadId!==before.threadId||next.approvalId!==before.approvalId||
    next.executionOperationId!==before.executionOperationId||
    !equal(next.sourceIds,before.sourceIds)||
    Date.parse(next.updatedAt)<Date.parse(before.updatedAt)||
    (next.state==='completed'&&!!next.sourceIds.length)||
    (next.state==='completed'&&!next.completedAt)||
    (next.state==='needs_reconciliation'&&!next.executionOperationId&&
      before.state!=='executing'))
    throw new R07JStorageError('R07J_INVALID_TASK_TRANSITION');
}
type AppendInput={
  scope:AuthenticatedScope;expectedRevision:number;eventId:string;
  idempotencyKey:string;body:ConversationEventBody;now:string;
};
type FastResult={event:ConversationEvent;revision:number;lastHash:string;replayed:boolean;
  authoritativeFullSnapshot:false};
export class R07JExperimentalIndexedJournal{
  constructor(private readonly db:R07JFirestoreClient){}
  private async documents(scope:AuthenticatedScope){
    const key=exactScopeKey(scope),prefix=await sha256(key),
      col=this.db.collection(R07J_COLLECTION);
    return {key,head:col.doc(prefix+':head'),
      bySequence:(n:number)=>col.doc(prefix+':event:'+String(n).padStart(6,'0')),
      byIdempotency:async(id:string)=>col.doc(prefix+':idem:'+await sha256(id)),
      byEventId:async(id:string)=>col.doc(prefix+':eventid:'+await sha256(id)),
      byMessage:async(id:string)=>col.doc(prefix+':message:'+await sha256(id)),
      byTurn:async(id:string)=>col.doc(prefix+':turn:'+await sha256(id)),
      byTask:async(id:string)=>col.doc(prefix+':task:'+await sha256(id)),
    };
  }
  /** Deliberately returns ONLY a narrow durable receipt, not a R03 snapshot. */
  async append(input:AppendInput):Promise<FastResult>{
    const refs=await this.documents(input.scope),key=refs.key;
    if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)
      throw new R07JStorageError('R07J_INVALID_EXPECTED_REVISION');
    // Validate body/IDs even on replay. Scope must be server-verified.
    const seed=await sealConversationEvent({...input,sequence:1,previousHash:ZERO});
    const baseline=parseHead(await refs.head.get(),key)??blank(key);
    const event=await sealConversationEvent({...input,
      sequence:baseline.revision+1,previousHash:baseline.lastHash});
    if(size(event)>R07J_MAX_EVENT_BYTES)
      throw new R07JStorageError('R07J_EVENT_BYTE_CAP');
    const idem=await refs.byIdempotency(input.idempotencyKey);
    const eid=await refs.byEventId(input.eventId);
    const kind=input.body.kind;
    const mid=kind==='message'?await refs.byMessage(input.body.messageId):null;
    const turn=kind==='turn_started'?await refs.byTurn(input.body.turn.turnId):
      kind==='message'?await refs.byTurn(input.body.turnId):null;
    const task=kind==='turn_started'?await refs.byTask(input.body.task.taskId):
      kind==='task_updated'?await refs.byTask(input.body.task.taskId):
      kind==='checkpoint'||kind==='uncertain_execution'?
        await refs.byTask(input.body.taskId):null;
    const result=await this.db.runTransaction(async tx=>{
      // All document reads must precede ANY writes in Firestore transactions.
      const current=parseHead(await tx.get(refs.head),key)??blank(key);
      const idemDoc=await tx.get(idem);
      if(idemDoc.exists){
        const receipt=idemDoc.data();
        if(!plain(receipt)||receipt.schemaVersion!==1||
          receipt.scopeKey!==key||!plain(receipt.event))
          throw new R07JStorageError('R07J_DAMAGED_RECEIPT');
        const saved=receipt.event as unknown as ConversationEvent;
        await verifySealedEvent(saved);
        if(saved.scopeKey!==key||saved.sequence>current.revision||
          saved.eventId!==input.eventId||saved.idempotencyKey!==input.idempotencyKey||
          !equal(saved.body,input.body))
          throw new R07JStorageError('R07J_IDEMPOTENCY_COLLISION');
        const stored=await tx.get(refs.bySequence(saved.sequence));
        if(!stored.exists||!equal(stored.data(),saved))
          throw new R07JStorageError('R07J_RECEIPT_EVENT_DIVERGENCE');
        return {event:saved,revision:current.revision,lastHash:current.lastHash,
          replayed:true,authoritativeFullSnapshot:false as const};
      }
      if(!equal(current,baseline))
        throw new R07JStorageError('R07J_CONCURRENT_HEAD_CONFLICT');
      if(input.expectedRevision!==current.revision)
        throw new R07JStorageError('R07J_STALE_REVISION');
      if(current.revision>=MAX_R03_EVENTS)
        throw new R07JStorageError('R07J_EVENT_CAP');
      if(current.lastEventAt&&Date.parse(event.eventAt)<Date.parse(current.lastEventAt))
        throw new R07JStorageError('R07J_TIME_REGRESSION');
      const eventDoc=await tx.get(refs.bySequence(event.sequence));
      const eidDoc=await tx.get(eid);
      const midDoc=mid?await tx.get(mid):null;
      const turnDoc=turn?await tx.get(turn):null;
      const taskDoc=task?await tx.get(task):null;
      if(eventDoc.exists||eidDoc.exists)
        throw new R07JStorageError('R07J_DUPLICATE_EVENT_ID');
      if(midDoc?.exists)
        throw new R07JStorageError('R07J_DUPLICATE_MESSAGE_ID');
      const next:Head={...current,revision:event.sequence,
        lastHash:event.hash,lastEventAt:event.eventAt};
      if(kind==='turn_started'){
        if(turnDoc?.exists||taskDoc?.exists||
          input.body.turn.sequenceNumber!==current.turnCount+1||
          input.body.turn.parentTurnId!==current.lastTurnId||
          input.body.task.state!=='created'||
          input.body.task.stateVersion!==0||
          (current.lastTaskState!==null&&
            !['completed','failed','cancelled'].includes(current.lastTaskState)))
          throw new R07JStorageError('R07J_INVALID_TURN_SEQUENCE');
        next.turnCount++;next.lastTurnId=input.body.turn.turnId;
        next.lastTaskId=input.body.task.taskId;next.lastTaskState='created';
      }else if(kind==='task_updated'){
        if(!taskDoc?.exists)throw new R07JStorageError('R07J_MISSING_TASK');
        const prior=taskDoc.data();
        if(!plain(prior)||prior.scopeKey!==key||prior.schemaVersion!==1||
          !plain(prior.task))throw new R07JStorageError('R07J_DAMAGED_TASK_INDEX');
        assertCoreContract('TaskState',prior.task);
        verifyStateTransition(prior.task as unknown as TaskState,input.body.task);
        if(input.body.task.taskId===current.lastTaskId)
          next.lastTaskState=input.body.task.state;
      }else if(kind==='message'){
        if(!turnDoc?.exists)
          throw new R07JStorageError('R07J_MESSAGE_TURN_UNKNOWN');
        const value=turnDoc.data();
        identity(value,key,'turnId');
        if((value as TurnRef).turnId!==input.body.turnId)
          throw new R07JStorageError('R07J_MESSAGE_TURN_MISMATCH');
      }else if(kind==='checkpoint'||kind==='uncertain_execution'){
        if(!taskDoc?.exists)
          throw new R07JStorageError('R07J_CHECKPOINT_TASK_UNKNOWN');
        const value=taskDoc.data();
        if(!plain(value)||value.scopeKey!==key||!plain(value.task)||
          value.task.taskId!==input.body.taskId)
          throw new R07JStorageError('R07J_DAMAGED_TASK_INDEX');
      }
      if(size(next)>R07J_MAX_HEAD_BYTES)
        throw new R07JStorageError('R07J_HEAD_BYTE_CAP');
      tx.create(refs.bySequence(event.sequence),event);
      tx.create(idem,{schemaVersion:1,scopeKey:key,event});
      tx.create(eid,{schemaVersion:1,scopeKey:key,eventId:event.eventId,
        sequence:event.sequence});
      if(kind==='turn_started'){
        tx.create(turn!,{schemaVersion:1,scopeKey:key,
          turnId:input.body.turn.turnId,taskId:input.body.task.taskId,
          sequenceNumber:input.body.turn.sequenceNumber});
        tx.create(task!,{schemaVersion:1,scopeKey:key,task:clone(input.body.task)});
      }else if(kind==='task_updated'){
        tx.set(task!,{schemaVersion:1,scopeKey:key,task:clone(input.body.task)});
      }else if(kind==='message'){
        tx.create(mid!,{schemaVersion:1,scopeKey:key,
          messageId:input.body.messageId,sequence:event.sequence});
      }
      if(current.revision===0)tx.create(refs.head,next);
      else tx.set(refs.head,next);
      return {event,revision:next.revision,lastHash:next.lastHash,
        replayed:false,authoritativeFullSnapshot:false as const};
    });
    return clone(result);
  }
  /** Auditable expensive recovery; validates ALL event hashes and R03 rules. */
  async auditFullHistory(scope:AuthenticatedScope):Promise<ConversationSnapshot>{
    const refs=await this.documents(scope),first=parseHead(await refs.head.get(),refs.key);
    if(!first)return projectEvents(scope,[]);
    const events:ConversationEvent[]=[];
    for(let start=1;start<=first.revision;start+=32){
      const indices=Array.from({length:Math.min(32,first.revision-start+1)},
        (_,i)=>start+i);
      const snapshots=await Promise.all(indices.map(n=>refs.bySequence(n).get()));
      for(let i=0;i<snapshots.length;i++){
        const snapshot=snapshots[i]!,value=snapshot.exists?snapshot.data():null;
        if(!plain(value)||value.schemaVersion!==1||
          value.scopeKey!==refs.key||value.sequence!==indices[i])
          throw new R07JStorageError('R07J_MISSING_OR_INVALID_EVENT');
        const event=value as unknown as ConversationEvent;
        await verifySealedEvent(event);
        events.push(clone(event));
      }
    }
    const after=parseHead(await refs.head.get(),refs.key);
    if(!equal(first,after))
      throw new R07JStorageError('R07J_UNSTABLE_AUDIT');
    const projected=projectEvents(scope,events);
    if(projected.revision!==first.revision||projected.lastHash!==first.lastHash||
      projected.lastEventAt!==first.lastEventAt||
      projected.turns.length!==first.turnCount||
      projected.turns.at(-1)?.turnId!==first.lastTurnId||
      projected.tasks.at(-1)?.taskId!==first.lastTaskId||
      projected.tasks.at(-1)?.state!==first.lastTaskState)
      throw new R07JStorageError('R07J_HEAD_AUDIT_MISMATCH');
    return projected;
  }
}
