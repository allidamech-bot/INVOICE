/**
 * R07B2 — one server-side, local-only turn coordinator (NOT an HTTP route).
 *
 * This is an explicitly DISABLED integration seam. It binds R07B trusted
 * authorization to R03 event CAS, R05 deterministic commands, and R04
 * UNSAVED draft generation. No provider, payment, financial write or PDF API.
 *
 * Storage dependencies must be durable, scoped and server-only before R07
 * release. Synthetic test repositories do not prove production persistence.
 */
import type {
  AuthenticatedScope,ConversationTurn,TaskState,ReviewDraft,
} from '../domain/contracts.js';
import {assertCoreContract} from '../domain/validation.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {transitionTask} from '../domain/state-machine.js';
import type {ScopedConversationLedger,ConversationSnapshot,
  ConversationEventBody} from '../conversation-state/event-store.js';
/** Coordinator consumes only the R03 semantic surface, not its storage class. */
export type R07CoordinatorEventLedger=Pick<ScopedConversationLedger,'snapshot'|'append'>;
import {authorizeR07ScopedRequest,
  type R07AuthenticatedPrincipalVerifier,
  type R07ServerMembershipStore,
  type R07RequestEnvelope} from '../security/server-membership.js';
import {recognizeR05LocalIntent,runR05Local} from '../router/local-intents.js';

export const R07B_LOCAL_COORDINATOR_ACTIVATED=false as const;

export interface TrustedDraftRepository {
  /** Atomic under the full nine-field scope and turn ID, content-checked. */
  createIfAbsent(scope:AuthenticatedScope,turnId:string,draft:ReviewDraft):
    Promise<ReviewDraft>;
  read(scope:AuthenticatedScope,turnId:string):Promise<ReviewDraft|null>;
}
export interface R07LocalTurnInput extends R07RequestEnvelope {
  requestId:string;
  idempotencyKey:string;
  userMessageId:string;
  message:string;
  mode:'advisor'|'controller';
}
export interface R07LocalResult {
  status:'completed';
  turnId:string;
  threadId:string;
  taskId:string;
  replayed:boolean;
  reply:string;
  draft:ReviewDraft|null;
  financialSaved:false;
  providerCalls:0;
  conversationRevision:number;
}
export class R07LocalError extends Error{
  constructor(public readonly code:string){super(code);}
}
const safeId=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&
  x.length<=160&&!/[\u0000-\u001f\u007f]/u.test(x);
const strictKeys=(v:unknown,keys:readonly string[]):boolean=>{
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.getPrototypeOf(v)!==Object.prototype)return false;
  const own=Object.keys(v).sort(),expected=[...keys].sort();
  return own.length===expected.length&&own.every((x,i)=>x===expected[i]);
};
const requestKeys=[
  'schemaVersion','accountId','companyId','branchId','threadId','scopeType',
  'requestId','idempotencyKey','userMessageId','message','mode',
] as const;
const envelope=(request:R07LocalTurnInput):R07RequestEnvelope=>({
  schemaVersion:1,
  accountId:request.accountId,companyId:request.companyId,
  branchId:request.branchId,threadId:request.threadId,
  scopeType:request.scopeType,
});
export function validateRequest(raw:unknown):asserts raw is R07LocalTurnInput{
  if(!strictKeys(raw,requestKeys))throw new R07LocalError('R07_INVALID_TURN_INPUT');
  const input=raw as R07LocalTurnInput;
  if(input.schemaVersion!==1||!safeId(input.requestId)||
    !safeId(input.idempotencyKey)||!safeId(input.userMessageId)||
    typeof input.message!=='string'||!input.message.trim()||
    input.message.length>6000||!['advisor','controller'].includes(input.mode))
    throw new R07LocalError('R07_INVALID_TURN_INPUT');
}
export function exactRequest(turn:ConversationTurn,input:R07LocalTurnInput):boolean{
  return turn.requestId===input.requestId&&
    turn.userMessageId===input.userMessageId&&
    turn.idempotencyKey===input.idempotencyKey&&turn.mode===input.mode&&
    turn.userMessage.text===input.message&&
    turn.userMessage.attachedSourceIds.length===0;
}
export function serverTime(clock:()=>Date,minimum?:string|null):string{
  const tick=clock().getTime();
  if(!Number.isFinite(tick))throw new R07LocalError('R07_SERVER_CLOCK_INVALID');
  return new Date(Math.max(tick,minimum?Date.parse(minimum):0)).toISOString();
}
export function makeTurn(scope:AuthenticatedScope,input:R07LocalTurnInput,now:string):
  {turn:ConversationTurn;task:TaskState}{
  const turnId=crypto.randomUUID(),taskId=crypto.randomUUID();
  const local=recognizeR05LocalIntent(input.message,0);
  if(!local)throw new R07LocalError('R07_LOCAL_INTENT_NOT_SUPPORTED');
  const turn:ConversationTurn={
    schemaVersion:1,scope:structuredClone(scope),
    turnId,threadId:scope.threadId,userMessageId:input.userMessageId,
    requestId:input.requestId,idempotencyKey:input.idempotencyKey,
    sequenceNumber:1,parentTurnId:null,
    userMessage:{text:input.message,languageHint:'unknown',attachedSourceIds:[]},
    mode:input.mode,receivedAt:now,stateVersion:0,
    selectedSourceIds:[],taskId,lifecycle:'received',outputResultId:null,
  };
  const task:TaskState={
    schemaVersion:1,scope:structuredClone(scope),taskId,threadId:scope.threadId,
    turnId,taskType:local.kind==='greeting'?'local_greeting':'local_draft_start',
    state:'created',revision:0,stateVersion:0,startedAt:now,updatedAt:now,
    completedAt:null,stageIndex:0,
    progress:{completedUnits:0,totalUnits:null,unitType:'unknown',observedAt:now},
    currentCheckpointId:null,sourceIds:[],draftId:null,approvalId:null,
    lastError:null,cancellable:true,retryPolicy:'safe_only',
    executionOperationId:null,
  };
  assertCoreContract('ConversationTurn',turn);
  assertCoreContract('TaskState',task);
  return {turn,task};
}
const eventId=(turnId:string,step:string)=>'r07-'+turnId+'-'+step;
const eventKey=(turnId:string,step:string)=>'r07step-'+turnId+'-'+step;
const isConflict=(error:unknown):boolean=>
  error instanceof Error && [
    'AI_NEXT_STALE_EVENT_REVISION','AI_NEXT_CONCURRENT_TURN',
    'AI_NEXT_IDEMPOTENCY_COLLISION','AI_NEXT_DUPLICATE_EVENT_ID',
    'R07J_CONCURRENT_HEAD_CONFLICT','R07J_STALE_REVISION',
    'R07J_DUPLICATE_EVENT_ID','R07J_IDEMPOTENCY_COLLISION',
  ].includes(error.message);
export class R07LocalCoordinator {
  constructor(private readonly deps:{
    ledger:R07CoordinatorEventLedger;
    draftStore:TrustedDraftRepository;
    principal:R07AuthenticatedPrincipalVerifier;
    membership:R07ServerMembershipStore;
    clock?:()=>Date;
  }){}
  private now():Date{return (this.deps.clock??(()=>new Date()))();}
  private async auth(
    token:string,request:R07RequestEnvelope,
  ):Promise<AuthenticatedScope>{
    const now=Math.floor(this.now().getTime()/1000);
    return authorizeR07ScopedRequest({
      bearerToken:token,body:request,principal:this.deps.principal,
      membership:this.deps.membership,serverNowEpochSeconds:now,
    });
  }
  private async append(scope:AuthenticatedScope,snapshot:ConversationSnapshot,
    turnId:string,step:string,body:ConversationEventBody){
    return this.deps.ledger.append({
      scope,expectedRevision:snapshot.revision,
      eventId:eventId(turnId,step),idempotencyKey:eventKey(turnId,step),
      body,now:serverTime(()=>this.now(),snapshot.lastEventAt),
    });
  }
  private async accepted(scope:AuthenticatedScope,input:R07LocalTurnInput):
    Promise<{turn:ConversationTurn;replayed:boolean}>{
    for(let attempts=0;attempts<5;attempts++){
      const snapshot=await this.deps.ledger.snapshot(scope);
      const found=snapshot.turns.find(t=>t.idempotencyKey===input.idempotencyKey);
      if(found){
        if(!exactRequest(found,input))throw new R07LocalError('R07_TURN_IDEMPOTENCY_COLLISION');
        return {turn:found,replayed:true};
      }
      const latest=snapshot.turns.at(-1),active=snapshot.tasks.at(-1);
      if(active&&!['completed','failed','cancelled'].includes(active.state))
        throw new R07LocalError('R07_ANOTHER_TURN_ACTIVE');
      const {turn,task}=makeTurn(scope,input,serverTime(()=>this.now(),snapshot.lastEventAt));
      turn.sequenceNumber=snapshot.turns.length+1;
      turn.parentTurnId=latest?.turnId??null;
      try{
        await this.append(scope,snapshot,turn.turnId,'start',{kind:'turn_started',turn,task});
        return {turn,replayed:false};
      }catch(error){
        if(!isConflict(error))throw error;
      }
    }
    throw new R07LocalError('R07_CONCURRENT_TURN_RETRY_LIMIT');
  }
  private async complete(
    scope:AuthenticatedScope,
    turn:ConversationTurn,
  ):Promise<{reply:string;draft:ReviewDraft|null;revision:number}>{
    const recognized=recognizeR05LocalIntent(turn.userMessage.text,0);
    if(!recognized)throw new R07LocalError('R07_RESTORED_INTENT_UNSUPPORTED');
    const assistantId='assistant-'+turn.turnId;
    const draftId='draft-'+turn.turnId;
    for(let attempts=0;attempts<28;attempts++){
      const snapshot=await this.deps.ledger.snapshot(scope);
      const task=snapshot.tasks.find(x=>x.taskId===turn.taskId);
      if(!task)throw new R07LocalError('R07_TASK_NOT_FOUND');
      if(task.state==='failed'||task.state==='cancelled'||
        task.state==='needs_reconciliation')
        throw new R07LocalError('R07_TASK_NOT_REPLAYABLE');
      const visible=snapshot.messages.find(m=>m.messageId===assistantId);
      if(task.state==='completed'){
        if(!visible)throw new R07LocalError('R07_COMPLETED_WITHOUT_REPLY');
        const stored=recognized.kind==='new_quote_draft'?
          await this.deps.draftStore.read(scope,turn.turnId):null;
        if(recognized.kind==='new_quote_draft'&&(!stored||
          stored.draftId!==draftId||task.draftId!==draftId||
          exactScopeKey(stored.scope)!==exactScopeKey(scope)))
          throw new R07LocalError('R07_MISSING_VERIFIED_DRAFT');
        return {reply:visible.text,draft:stored,revision:snapshot.revision};
      }
      let step:string,body:ConversationEventBody;
      if(!snapshot.messages.some(m=>m.messageId===turn.userMessageId)){
        step='user-message';
        body={kind:'message',messageId:turn.userMessageId,
          turnId:turn.turnId,role:'user',text:turn.userMessage.text,sourceIds:[]};
      }else if(task.state==='created'||task.state==='understanding'){
        const to=task.state==='created'?'understanding':'processing';
        step='state-'+to;
        body={kind:'task_updated',task:transitionTask(task,to,{
          expectedStateVersion:task.stateVersion,
          now:serverTime(()=>this.now(),task.updatedAt),
        })};
      }else if(task.state==='processing'){
        const locally=await runR05Local({
          text:turn.userMessage.text,attachedSourceIds:[],
          scope,draftId,now:turn.receivedAt,
        });
        if(!locally)throw new R07LocalError('R07_LOCAL_INTENT_NOT_SUPPORTED');
        if(locally.kind==='draft'){
          // Fail closed: never report draft creation until independently
          // authoritative server store confirms same immutable revision.
          const stored=await this.deps.draftStore.createIfAbsent(scope,turn.turnId,locally.draft);
          if(!stored||stored.draftId!==locally.draft.draftId||
            stored.immutableRevisionHash!==locally.draft.immutableRevisionHash||
            stored.draftRevision!==1||stored.kind!=='quotation'||
            stored.status!=='needs_review'||
            exactScopeKey(stored.scope)!==exactScopeKey(scope))
            throw new R07LocalError('R07_DRAFT_STORE_COLLISION');
        }
        if(!visible){
          step='assistant-message';
          body={kind:'message',messageId:assistantId,
            turnId:turn.turnId,role:'assistant',text:locally.reply,sourceIds:[]};
        }else{
          step='state-completed';
          body={kind:'task_updated',task:{
            ...transitionTask(task,'completed',{
              expectedStateVersion:task.stateVersion,
              now:serverTime(()=>this.now(),task.updatedAt),
            }),
            draftId:locally.kind==='draft'?draftId:null,
          }};
          assertCoreContract('TaskState',body.task);
        }
      }else{
        throw new R07LocalError('R07_UNEXPECTED_LOCAL_TASK_STATE');
      }
      try{await this.append(scope,snapshot,turn.turnId,step,body);}
      catch(error){if(!isConflict(error))throw error;}
    }
    throw new R07LocalError('R07_LOCAL_TASK_RETRY_LIMIT');
  }
  /**
   * All calls re-authorize. Browser-supplied role/scope fields are rejected
   * before any database access; account/company/branch are lookup keys only.
   */
  async accept(token:string,raw:unknown):Promise<R07LocalResult>{
    validateRequest(raw);
    const request=raw as R07LocalTurnInput;
    const recognized=recognizeR05LocalIntent(request.message,0);
    if(!recognized)throw new R07LocalError('R07_LOCAL_INTENT_NOT_SUPPORTED');
    const scope=await this.auth(token,envelope(request));
    if(recognized.kind==='new_quote_draft'&&
      (scope.scopeType!=='business'||scope.role==='viewer'))
      throw new R07LocalError('R07_DRAFT_PREPARATION_DENIED');
    const {turn,replayed}=await this.accepted(scope,request);
    const {reply,draft,revision}=await this.complete(scope,turn);
    return {
      status:'completed',turnId:turn.turnId,taskId:turn.taskId!,
      threadId:scope.threadId,replayed,reply,draft,
      financialSaved:false,providerCalls:0,conversationRevision:revision,
    };
  }
  async history(token:string,raw:unknown):Promise<ConversationSnapshot>{
    const scope=await this.auth(token,raw as R07RequestEnvelope);
    return this.deps.ledger.snapshot(scope);
  }
}
