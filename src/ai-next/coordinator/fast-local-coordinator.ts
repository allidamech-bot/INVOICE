/**
 * R07M — unmounted, disabled local Controller/Advisor using R07L current
 * state + R07M indexed immutable request receipts. No live HTTP route.
 * Only deterministic R05 local greeting and UNSAVED review draft permitted.
 * Never use the operational model as financial execution evidence.
 */
import type {AuthenticatedScope,ConversationTurn,ReviewDraft,TaskState}
  from '../domain/contracts.js';
import type {R07PPlan} from '../router/semantic-planner.js';
import {fingerprintR07RReviewRequest,
  type R07RReceiptPrepareInput} from './r07r-draft-preparation.js';
import type {R07DExperimentalFirestoreDraftStore}
  from '../storage/firestore-review-drafts.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {assertCoreContract} from '../domain/validation.js';
import {transitionTask} from '../domain/state-machine.js';
import {recognizeR05LocalIntent,runR05Local} from '../router/local-intents.js';
import {R07JExperimentalIndexedJournal,
  type R07LOperationalView} from '../storage/firestore-indexed-append.js';
import type {ConversationEventBody} from '../conversation-state/event-store.js';
import {authorizeR07ScopedRequest,
  type R07AuthenticatedPrincipalVerifier,type R07ServerMembershipStore,
  type R07RequestEnvelope} from '../security/server-membership.js';
import {validateRequest,exactRequest,serverTime,makeTurn,
  R07LocalError,type R07LocalTurnInput,type R07LocalResult,
  type TrustedDraftRepository} from './local-coordinator.js';

export const R07M_FAST_COORDINATOR_ACTIVATED=false as const;
const isConflict=(error:unknown):boolean=>error instanceof Error&&[
  'R07J_CONCURRENT_HEAD_CONFLICT','R07J_STALE_REVISION',
  'R07J_DUPLICATE_EVENT_ID','R07J_IDEMPOTENCY_COLLISION',
  'R07J_INVALID_TURN_SEQUENCE',
].includes(error.message);
type Completion={reply:string;draft:ReviewDraft|null;revision:number;
  syntheticInvocations?:number};
export interface R07MReviewReceiptAuditResult{
  status:'review_receipt_checkpointed';turnId:string;taskId:string;
  replayed:boolean;conversationRevision:number;
  appliedDraftRevision:number;currentDraftRevision:number;
  appliedDraftHash:string;financialSaved:false;
  draftEditPerformed:false;providerCalls:0;
}
/** Published chat acknowledgement of an ALREADY verified unsaved R07D edit. */
export interface R07MVerifiedReviewReplyResult{
  status:'verified_review_reply_published';turnId:string;taskId:string;
  replyMessageId:string;reply:string;replayed:boolean;
  conversationRevision:number;appliedDraftRevision:number;
  appliedDraftHash:string;financialSaved:false;
  draftEditPerformed:false;providerCalls:0;
}
export interface R07MSemanticTurnResult{
  status:'completed';turnId:string;threadId:string;taskId:string;
  replayed:boolean;reply:string;conversationRevision:number;
  syntheticInvocations:number;
  semanticOutcome:'proposal_only';financialSaved:false;
  businessReadPerformed:false;draftEdited:false;
}
const envelope=(request:R07LocalTurnInput):R07RequestEnvelope=>({
  schemaVersion:1,accountId:request.accountId,companyId:request.companyId,
  branchId:request.branchId,threadId:request.threadId,
  scopeType:request.scopeType,
});
const eventId=(id:string,step:string)=>'r07-'+id+'-'+step;
const eventKey=(id:string,step:string)=>'r07step-'+id+'-'+step;

/**
 * R07M semantic turns use the SAME R07J request index/event/task state;
 * no separate journal, coordinator, or source-of-truth is introduced.
 * The task's completion is only a user-visible PLANNING response.
 */
function newOfflineSemanticTurn(scope:AuthenticatedScope,
  input:R07LocalTurnInput,now:string):{turn:ConversationTurn;task:TaskState}{
  const turnId=crypto.randomUUID(),taskId=crypto.randomUUID();
  const turn:ConversationTurn={
    schemaVersion:1,scope:structuredClone(scope),turnId,threadId:scope.threadId,
    userMessageId:input.userMessageId,requestId:input.requestId,
    idempotencyKey:input.idempotencyKey,sequenceNumber:1,parentTurnId:null,
    userMessage:{text:input.message,languageHint:'unknown',attachedSourceIds:[]},
    mode:input.mode,receivedAt:now,stateVersion:0,selectedSourceIds:[],
    taskId,lifecycle:'received',outputResultId:null,
  };
  const task:TaskState={
    schemaVersion:1,scope:structuredClone(scope),taskId,threadId:scope.threadId,
    turnId,taskType:'semantic_proposal_only',state:'created',
    revision:0,stateVersion:0,startedAt:now,updatedAt:now,
    completedAt:null,stageIndex:0,
    progress:{completedUnits:0,totalUnits:null,unitType:'unknown',observedAt:now},
    currentCheckpointId:null,sourceIds:[],draftId:null,approvalId:null,
    lastError:null,cancellable:true,retryPolicy:'safe_only',executionOperationId:null,
  };
  assertCoreContract('ConversationTurn',turn);
  assertCoreContract('TaskState',task);
  return {turn,task};
}
function safeSemanticReply(plan:R07PPlan):string{
  if(plan.status==='unsupported')
    return 'تعذر تحليل الطلب بأمان. لم أقرأ أو أغيّر أي بيانات مالية.';
  if(plan.status==='needs_clarification')
    return 'يحتاج الطلب إلى توضيح مرجع أو معلومة قبل المتابعة. لم يحدث أي تعديل.';
  if(plan.status==='approval_required')
    return 'قد يتطلب الطلب موافقة مستقلة. لم تُنشأ موافقة ولم يُحفظ مستند مالي.';
  switch(plan.intent.action){
    case 'edit_draft':case 'prepare_quote':
      return 'فهمت طلب تجهيز المسودة، لكن لم أطبّق أي تعديل أو أحفظ مستندًا ماليًا.';
    case 'read_business':case 'read_file':case 'preview_draft':case 'analyze':
      return 'تم تصنيف طلب القراءة أو التحليل، لكن لم أقرأ بيانات الأعمال أو المستندات بعد.';
    default:
      return 'فهمت الطلب مبدئيًا. لم أنفّذ أي عملية على البيانات أو المستندات.';
  }
}

export class R07MFastLocalCoordinator{
  constructor(private readonly deps:{
    journal:R07JExperimentalIndexedJournal;
    draftStore:TrustedDraftRepository;
    principal:R07AuthenticatedPrincipalVerifier;
    membership:R07ServerMembershipStore;
    clock?:()=>Date;
    /** Test-only injection. No live provider or production endpoint permitted. */
    offlineSemanticPlanner?:Pick<import('../router/semantic-planner.js').R07PSemanticPlanner,'plan'>;
    /** Server-owned safety switch, NOT a request/browser flag. */
    allowOfflineSemanticFixtures?:boolean;
    /** Optional existing R07D receipt reader, not a new storage writer. */
    offlineReviewReceiptStore?:Pick<R07DExperimentalFirestoreDraftStore,
      'readEditReceipt'>;
    /** Injected only for isolated offline verification, never browser flags. */
    allowOfflineReviewReceiptAudit?:boolean;
    /** Independent server-only opt-in; unavailable from production routes. */
    allowOfflineVerifiedReviewReply?:boolean;
  }){}
  private now():Date{return(this.deps.clock??(()=>new Date()))();}
  private async auth(token:string,raw:R07RequestEnvelope):
    Promise<AuthenticatedScope>{
    return authorizeR07ScopedRequest({
      bearerToken:token,body:raw,principal:this.deps.principal,
      membership:this.deps.membership,
      serverNowEpochSeconds:Math.floor(this.now().getTime()/1000),
    });
  }
  private async read(scope:AuthenticatedScope):Promise<R07LOperationalView>{
    const result=await this.deps.journal.readOperationalState(scope);
    if(result.completeHistory!==false||
      result.authoritativeForFinancialExecution!==false||
      result.view.scopeKey!==exactScopeKey(scope))
      throw new R07LocalError('R07M_INVALID_OPERATIONAL_BOUNDARY');
    return result.view;
  }
  private async append(scope:AuthenticatedScope,view:R07LOperationalView,
    turnId:string,step:string,body:ConversationEventBody):Promise<void>{
    const receipt=await this.deps.journal.append({
      scope,expectedRevision:view.revision,eventId:eventId(turnId,step),
      idempotencyKey:eventKey(turnId,step),body,
      now:serverTime(()=>this.now(),view.lastEventAt),
    });
    if(receipt.authoritativeFullSnapshot!==false||
      receipt.event.scopeKey!==view.scopeKey||
      receipt.event.eventId!==eventId(turnId,step)||
      receipt.event.idempotencyKey!==eventKey(turnId,step)||
      receipt.revision<view.revision+Number(!receipt.replayed))
      throw new R07LocalError('R07M_INVALID_COMMIT_RECEIPT');
  }
  private async verifiedDraft(scope:AuthenticatedScope,turn:ConversationTurn,
    task:TaskState):Promise<ReviewDraft|null>{
    const recognized=recognizeR05LocalIntent(turn.userMessage.text,0);
    if(!recognized){
      if(task.taskType==='semantic_proposal_only')return null;
      throw new R07LocalError('R07_RESTORED_INTENT_UNSUPPORTED');
    }
    if(recognized.kind!=='new_quote_draft')return null;
    const saved=await this.deps.draftStore.read(scope,turn.turnId);
    if(!saved||saved.draftId!=='draft-'+turn.turnId||
      task.draftId!==saved.draftId||
      saved.kind!=='quotation'||saved.status!=='needs_review'||
      saved.approvalReceiptId!==null||
      exactScopeKey(saved.scope)!==exactScopeKey(scope))
      throw new R07LocalError('R07_MISSING_VERIFIED_DRAFT');
    return saved;
  }
  private async historical(scope:AuthenticatedScope,turn:ConversationTurn):
    Promise<Completion>{
    // Rare old-key replay falls back to FULL R03-audited history. New and
    // latest operations never hit this path. No permission to truncate.
    const history=await this.deps.journal.auditFullHistory(scope);
    const original=history.turns.find(x=>x.turnId===turn.turnId&&
      x.idempotencyKey===turn.idempotencyKey);
    if(!original)
      throw new R07LocalError('R07M_HISTORICAL_TURN_NOT_VERIFIED');
    const task=history.tasks.find(t=>t.taskId===turn.taskId);
    if(!task||task.state!=='completed')
      throw new R07LocalError('R07M_HISTORICAL_TASK_UNRESOLVED');
    const reply=history.messages.find(m=>m.messageId==='assistant-'+turn.turnId&&
      m.turnId===turn.turnId&&m.role==='assistant');
    if(!reply)throw new R07LocalError('R07_COMPLETED_WITHOUT_REPLY');
    return {reply:reply.text,draft:await this.verifiedDraft(scope,turn,task),
      revision:history.revision};
  }
  private async accepted(scope:AuthenticatedScope,input:R07LocalTurnInput,
    semantic=false):
    Promise<{turn:ConversationTurn;replayed:boolean;historical:boolean}>{

    for(let attempt=0;attempt<8;attempt++){
      // Durable request index prevents an older key from creating a duplicate
      // turn after several subsequent turns; indexes are atomically written
      // with the first event and verified against that sealed event.
      const existing=await this.deps.journal.readTurnByRequest(
        scope,input.idempotencyKey);
      if(existing){
        if(!exactRequest(existing,input))
          throw new R07LocalError('R07_TURN_IDEMPOTENCY_COLLISION');
        const latest=await this.read(scope);
        return {turn:existing,replayed:true,
          historical:latest.turn?.turnId!==existing.turnId};
      }
      const current=await this.read(scope);
      if(current.task&&!['completed','failed','cancelled'].includes(
        current.task.state))
        throw new R07LocalError('R07_ANOTHER_TURN_ACTIVE');
      const startedAt=serverTime(()=>this.now(),current.lastEventAt);
      const {turn,task}=semantic?
        newOfflineSemanticTurn(scope,input,startedAt):makeTurn(scope,input,startedAt);
      turn.sequenceNumber=(current.turn?.sequenceNumber??0)+1;
      turn.parentTurnId=current.turn?.turnId??null;
      try{
        await this.append(scope,current,turn.turnId,'start',{
          kind:'turn_started',turn,task});
        return {turn,replayed:false,historical:false};
      }catch(error){if(!isConflict(error))throw error;}
    }
    throw new R07LocalError('R07_CONCURRENT_TURN_RETRY_LIMIT');
  }
  private async complete(scope:AuthenticatedScope,turn:ConversationTurn,
    token?:string):Promise<Completion>{
    const recognized=recognizeR05LocalIntent(turn.userMessage.text,0);
    if(!recognized&&(!token||!this.deps.allowOfflineSemanticFixtures||
      !this.deps.offlineSemanticPlanner))
      throw new R07LocalError('R07_RESTORED_INTENT_UNSUPPORTED');
    let syntheticInvocations=0;
    const assistantId='assistant-'+turn.turnId;
    const draftId='draft-'+turn.turnId;
    for(let attempt=0;attempt<30;attempt++){
      const view=await this.read(scope);
      if(view.turn?.turnId!==turn.turnId||view.task?.taskId!==turn.taskId)
        throw new R07LocalError('R07M_TURN_CHANGED');
      const task=view.task;
      if(task.state==='failed'||task.state==='cancelled'||
        task.state==='needs_reconciliation')
        throw new R07LocalError('R07_TASK_NOT_REPLAYABLE');
      const visible=view.assistantReply?.messageId===assistantId?
        view.assistantReply:null;
      if(task.state==='completed'){
        if(!visible&&task.taskType==='semantic_proposal_only'){
          // A later R07D-verified confirmation is a SECOND assistant event.
          // Do not confuse that later event with the original planning-only
          // reply, or misreport an edit as semantic proposal execution.
          return this.historical(scope,turn);
        }
        if(!visible)throw new R07LocalError('R07_COMPLETED_WITHOUT_REPLY');
        const draft=await this.verifiedDraft(scope,turn,task);
        return {reply:visible.text,draft,revision:view.revision,
          syntheticInvocations};
      }
      let step:string,body:ConversationEventBody;
      if(!view.userMessageSeen){
        step='user-message';
        body={kind:'message',messageId:turn.userMessageId,turnId:turn.turnId,
          role:'user',text:turn.userMessage.text,sourceIds:[]};
      }else if(task.state==='created'||task.state==='understanding'){
        const to=task.state==='created'?'understanding':'processing';
        step='state-'+to;
        body={kind:'task_updated',task:transitionTask(task,to,{
          expectedStateVersion:task.stateVersion,
          now:serverTime(()=>this.now(),task.updatedAt),
        })};
      }else if(task.state==='processing'){
        if(task.taskType==='semantic_proposal_only'){
          if(recognized||!token||!this.deps.allowOfflineSemanticFixtures||
            !this.deps.offlineSemanticPlanner)
            throw new R07LocalError('R07M_UNAUTHORIZED_SEMANTIC_PROCESSING');
          if(!visible){
            // The original immutable turn was journaled BEFORE parsing.
            // A restart after an acknowledged assistant event skips inference.
            // Before that acknowledgement, replay may re-interpret a fixture,
            // but never performs a financial or business mutation.
            const recordedInput:R07LocalTurnInput={
              ...envelope({
                schemaVersion:1,accountId:scope.accountId,
                companyId:scope.companyId,branchId:scope.branchId,
                threadId:scope.threadId,scopeType:scope.scopeType,
                requestId:turn.requestId,idempotencyKey:turn.idempotencyKey,
                userMessageId:turn.userMessageId,
                message:turn.userMessage.text,mode:turn.mode,
              }),
              requestId:turn.requestId,idempotencyKey:turn.idempotencyKey,
              userMessageId:turn.userMessageId,
              message:turn.userMessage.text,mode:turn.mode,
            };
            const planned=await this.deps.offlineSemanticPlanner.plan(
              token,recordedInput);
            syntheticInvocations++;
            if(planned.interpretation!=='synthetic_model'||
              planned.providerCalls!==1||planned.financialSaved!==false||
              planned.intent.executable!==false||
              planned.intent.scope.threadId!==scope.threadId||
              exactScopeKey(planned.intent.scope)!==exactScopeKey(scope)||
              planned.intent.referencedSourceIds.length>0&&
                planned.intent.sourcePolicy!=='uploaded_only')
              throw new R07LocalError('R07M_UNTRUSTED_SEMANTIC_PLAN');
            step='assistant-message';
            body={kind:'message',messageId:assistantId,turnId:turn.turnId,
              role:'assistant',text:safeSemanticReply(planned),sourceIds:[]};
          }else{
            step='state-completed';
            body={kind:'task_updated',task:transitionTask(task,'completed',{
              expectedStateVersion:task.stateVersion,
              now:serverTime(()=>this.now(),task.updatedAt),
            })};
          }
        }else{
        const locally=await runR05Local({
          text:turn.userMessage.text,attachedSourceIds:[],scope,draftId,
          now:turn.receivedAt,
        });
        if(!locally)throw new R07LocalError('R07_LOCAL_INTENT_NOT_SUPPORTED');
        if(locally.kind==='draft'){
          const draft=await this.deps.draftStore.createIfAbsent(
            scope,turn.turnId,locally.draft);
          if(!draft||draft.draftId!==locally.draft.draftId||
            draft.immutableRevisionHash!==locally.draft.immutableRevisionHash||
            draft.draftRevision!==1||draft.kind!=='quotation'||
            draft.status!=='needs_review'||
            exactScopeKey(draft.scope)!==exactScopeKey(scope))
            throw new R07LocalError('R07_DRAFT_STORE_COLLISION');
        }
        if(!visible){
          step='assistant-message';
          body={kind:'message',messageId:assistantId,turnId:turn.turnId,
            role:'assistant',text:locally.reply,sourceIds:[]};
        }else{
          step='state-completed';
          body={kind:'task_updated',task:{
            ...transitionTask(task,'completed',{
              expectedStateVersion:task.stateVersion,
              now:serverTime(()=>this.now(),task.updatedAt),
            }),draftId:locally.kind==='draft'?draftId:null,
          }};
          assertCoreContract('TaskState',body.task);
        }
        }
      }else{
        throw new R07LocalError('R07_UNEXPECTED_LOCAL_TASK_STATE');
      }
      try{await this.append(scope,view,turn.turnId,step,body);}
      catch(error){if(!isConflict(error))throw error;}
    }
    throw new R07LocalError('R07_LOCAL_TASK_RETRY_LIMIT');
  }
  async accept(token:string,raw:unknown):Promise<R07LocalResult>{
    validateRequest(raw);
    const request=raw as R07LocalTurnInput;
    const local=recognizeR05LocalIntent(request.message,0);
    if(!local)throw new R07LocalError('R07_LOCAL_INTENT_NOT_SUPPORTED');
    const scope=await this.auth(token,envelope(request));
    if(local.kind==='new_quote_draft'&&
      (scope.scopeType!=='business'||scope.role==='viewer'))
      throw new R07LocalError('R07_DRAFT_PREPARATION_DENIED');
    const accepted=await this.accepted(scope,request);
    const result=accepted.historical?
      await this.historical(scope,accepted.turn):
      await this.complete(scope,accepted.turn);
    return {status:'completed',turnId:accepted.turn.turnId,
      threadId:scope.threadId,taskId:accepted.turn.taskId!,
      replayed:accepted.replayed,reply:result.reply,draft:result.draft,
      financialSaved:false,providerCalls:0,conversationRevision:result.revision};
  }
  /**
   * Disabled offline semantic turn acceptance. This journals a real R07M
   * authenticated request and one planning-only assistant message, never
   * reads business records or edits review drafts.
   */
  async acceptOfflineSemantic(token:string,raw:unknown):
    Promise<R07MSemanticTurnResult>{
    validateRequest(raw);
    const request=raw as R07LocalTurnInput;
    if(recognizeR05LocalIntent(request.message,0))
      throw new R07LocalError('R07M_USE_DETERMINISTIC_ACCEPT');
    if(!this.deps.allowOfflineSemanticFixtures||
      !this.deps.offlineSemanticPlanner)
      throw new R07LocalError('R07M_OFFLINE_SEMANTIC_DISABLED');
    const scope=await this.auth(token,envelope(request));
    const accepted=await this.accepted(scope,request,true);
    const result=accepted.historical?
      await this.historical(scope,accepted.turn):
      await this.complete(scope,accepted.turn,token);
    if(result.draft!==null)
      throw new R07LocalError('R07M_SEMANTIC_FINANCIAL_DRAFT_FORBIDDEN');
    return {status:'completed',turnId:accepted.turn.turnId,
      threadId:scope.threadId,taskId:accepted.turn.taskId!,
      replayed:accepted.replayed,reply:result.reply,
      conversationRevision:result.revision,
      syntheticInvocations:result.syntheticInvocations??0,
      semanticOutcome:'proposal_only',financialSaved:false,
      businessReadPerformed:false,draftEdited:false};
  }

  /**
   * Audits a PREVIOUSLY COMMITTED R07D review edit in R07M's SAME journal.
   * This does not mutate a draft. The two Firestore roots are NOT one
   * transaction: the R07D receipt remains authoritative and can be linked
   * after a crash without repeating the edit or invoking any model.
   *
   * This is deliberately only a checkpoint on an existing COMPLETED
   * semantic-proposal turn, not a fabricated R07M financial operation.
   */
  async linkOfflineReviewReceipt(token:string,raw:unknown):
    Promise<R07MReviewReceiptAuditResult>{
    if(!this.deps.allowOfflineReviewReceiptAudit||
      !this.deps.offlineReviewReceiptStore)
      throw new R07LocalError('R07M_REVIEW_RECEIPT_AUDIT_DISABLED');
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||
      Object.getPrototypeOf(raw)!==Object.prototype||
      Object.keys(raw).sort().join('|')!==[
        'turn','originTurnId','expectedDraftRevision','expectedDraftHash',
      ].sort().join('|'))
      throw new R07LocalError('R07M_INVALID_REVIEW_AUDIT_INPUT');
    const input=raw as R07RReceiptPrepareInput;
    validateRequest(input.turn);
    const fingerprint=await fingerprintR07RReviewRequest(input);
    const scope=await this.auth(token,envelope(input.turn));
    if(scope.scopeType!=='business'||scope.role==='viewer'||
      input.turn.mode!=='controller')
      throw new R07LocalError('R07M_REVIEW_AUDIT_DENIED');
    const turn=await this.deps.journal.readTurnByRequest(
      scope,input.turn.idempotencyKey);
    if(!turn||!exactRequest(turn,input.turn)||
      turn.mode!=='controller')
      throw new R07LocalError('R07M_REVIEW_TURN_NOT_VERIFIED');
    const current=await this.read(scope);
    let state:TaskState|undefined;
    if(current.turn?.turnId===turn.turnId){
      state=current.task??undefined;
    }else{
      // Full history is exceptional for an older request. Never treat an
      // incomplete materialized latest turn as a verified historical task.
      const history=await this.deps.journal.auditFullHistory(scope);
      state=history.tasks.find(x=>x.taskId===turn.taskId);
    }
    if(!state||state.taskId!==turn.taskId||
      state.turnId!==turn.turnId||
      state.taskType!=='semantic_proposal_only'||
      state.state!=='completed'||
      exactScopeKey(state.scope)!==exactScopeKey(scope))
      throw new R07LocalError('R07M_REVIEW_TASK_NOT_COMPLETED');
    const saved=await this.deps.offlineReviewReceiptStore.readEditReceipt({
      scope,turnId:input.originTurnId,requestKey:input.turn.idempotencyKey,
      requestFingerprint:fingerprint,
      expectedRevision:input.expectedDraftRevision,
      expectedHash:input.expectedDraftHash,
    });
    if(!saved||!saved.replayed||
      saved.receipt.appliedRevision!==input.expectedDraftRevision+1||
      saved.receipt.appliedHash.length!==64||
      saved.draft.draftId!=='draft-'+input.originTurnId||
      saved.draft.status!=='needs_review'||
      saved.draft.approvalReceiptId!==null||
      saved.draft.draftRevision<saved.receipt.appliedRevision||
      exactScopeKey(saved.draft.scope)!==exactScopeKey(scope))
      throw new R07LocalError('R07M_REVIEW_RECEIPT_NOT_VERIFIED');
    const id='review-receipt-'+turn.turnId;
    const body:ConversationEventBody={
      kind:'checkpoint',taskId:state.taskId,checkpointId:id,
      sourceIds:[],referenceHash:saved.receipt.appliedHash,
      stage:'r07r_unsaved_review_edit_receipt_v1',
    };
    for(let attempts=0;attempts<8;attempts++){
      const view=await this.read(scope);
      try{
        const committed=await this.deps.journal.append({
          scope,expectedRevision:view.revision,
          eventId:eventId(turn.turnId,'review-receipt'),
          idempotencyKey:eventKey(turn.turnId,'review-receipt'),
          body,now:serverTime(()=>this.now(),view.lastEventAt),
        });
        if(committed.authoritativeFullSnapshot!==false||
          committed.event.scopeKey!==exactScopeKey(scope)||
          committed.event.eventId!==eventId(turn.turnId,'review-receipt')||
          committed.event.body.kind!=='checkpoint'||
          committed.event.body.referenceHash!==saved.receipt.appliedHash||
          committed.event.body.taskId!==state.taskId)
          throw new R07LocalError('R07M_INVALID_REVIEW_CHECKPOINT');
        return {
          status:'review_receipt_checkpointed',turnId:turn.turnId,
          taskId:state.taskId,replayed:committed.replayed,
          conversationRevision:committed.revision,
          appliedDraftRevision:saved.receipt.appliedRevision,
          currentDraftRevision:saved.draft.draftRevision,
          appliedDraftHash:saved.receipt.appliedHash,
          financialSaved:false,draftEditPerformed:false,providerCalls:0,
        };
      }catch(error){
        if(!isConflict(error))throw error;
      }
    }
    throw new R07LocalError('R07M_REVIEW_CHECKPOINT_RETRY_LIMIT');
  }

  /**
   * Server-only offline publication of a SECOND immutable assistant message
   * AFTER R07D verified receipt + R07M immutable checkpoint both exist.
   * Not a replacement of the earlier planning-only reply or a new edit.
   *
   * R07D and R07M are two separate transaction roots. A crash is recovered
   * by the same request; an older unacknowledged turn is never inserted out
   * of order after another user turn. No live Controller path invokes this.
   */
  async publishOfflineVerifiedReviewReply(token:string,raw:unknown):
    Promise<R07MVerifiedReviewReplyResult>{
    if(!this.deps.allowOfflineVerifiedReviewReply)
      throw new R07LocalError('R07M_VERIFIED_REVIEW_REPLY_DISABLED');
    const linked=await this.linkOfflineReviewReceipt(token,raw);
    const input=raw as R07RReceiptPrepareInput;
    // Re-authorize independently before the user-visible journal write.
    const scope=await this.auth(token,envelope(input.turn));
    const threadKey=exactScopeKey(scope);
    const replyMessageId='review-confirmation-'+linked.turnId;
    const reply='تم إثبات تطبيق تعديل مسودة عرض السعر في المراجعة رقم '+
      String(linked.appliedDraftRevision)+
      '. قد تكون هناك مراجعات أحدث؛ راجع المسودة الحالية. '+
      'لم يتم إصدار عرض السعر أو حفظ معاملة مالية.';
    const body:ConversationEventBody={
      kind:'message',messageId:replyMessageId,
      turnId:linked.turnId,role:'assistant',text:reply,sourceIds:[],
    };
    let publishedReplay=false;
    let publishedRevision=0;
    for(let attempt=0;attempt<8;attempt++){
      const history=await this.deps.journal.auditFullHistory(scope);
      if(history.scopeKey!==threadKey||
        !history.turns.some(t=>t.turnId===linked.turnId&&
          t.taskId===linked.taskId)||
        !history.tasks.some(t=>t.taskId===linked.taskId&&
          t.state==='completed'&&t.taskType==='semantic_proposal_only')||
        !history.checkpointRefs.some(c=>
          c.taskId===linked.taskId&&
          c.checkpointId==='review-receipt-'+linked.turnId&&
          c.stage==='r07r_unsaved_review_edit_receipt_v1'&&
          c.referenceHash===linked.appliedDraftHash))
        throw new R07LocalError('R07M_UNVERIFIED_REVIEW_REPLY_EVIDENCE');
      const prior=history.messages.filter(m=>m.messageId===replyMessageId);
      if(prior.length>1||prior.length===1&&
        (prior[0]?.turnId!==linked.turnId||
          prior[0]?.role!=='assistant'||
          prior[0]?.text!==reply||
          prior[0]?.sourceIds.length!==0))
        throw new R07LocalError('R07M_REVIEW_REPLY_COLLISION');
      if(prior.length===1){
        publishedReplay=true;publishedRevision=history.revision;break;
      }
      // Late confirmation for an older turn would reorder the displayed
      // transcript. Keep the receipt checkpoint and require reconciliation.
      if(history.turns.at(-1)?.turnId!==linked.turnId)
        throw new R07LocalError('R07M_REVIEW_REPLY_OUT_OF_ORDER');
      try{
        const committed=await this.deps.journal.append({
          scope,expectedRevision:history.revision,
          eventId:eventId(linked.turnId,'verified-review-reply'),
          idempotencyKey:eventKey(linked.turnId,'verified-review-reply'),
          body,now:serverTime(()=>this.now(),history.lastEventAt),
        });
        if(committed.authoritativeFullSnapshot!==false||
          committed.event.scopeKey!==threadKey||
          committed.event.eventId!==
            eventId(linked.turnId,'verified-review-reply')||
          committed.event.body.kind!=='message'||
          committed.event.body.messageId!==replyMessageId||
          committed.event.body.text!==reply)
          throw new R07LocalError('R07M_INVALID_VERIFIED_REPLY_COMMIT');
        publishedReplay=committed.replayed;
        publishedRevision=committed.revision;
        break;
      }catch(error){if(!isConflict(error))throw error;}
    }
    if(!publishedRevision)
      throw new R07LocalError('R07M_VERIFIED_REPLY_RETRY_LIMIT');
    // Strong read-after-write; do not claim a visible result from an
    // unverified receipt, incomplete event chain or ambiguous transcript.
    const verified=await this.deps.journal.auditFullHistory(scope);
    const message=verified.messages.filter(m=>m.messageId===replyMessageId);
    if(message.length!==1||message[0]?.text!==reply||
      message[0].turnId!==linked.turnId||
      !verified.checkpointRefs.some(c=>
        c.checkpointId==='review-receipt-'+linked.turnId&&
        c.referenceHash===linked.appliedDraftHash))
      throw new R07LocalError('R07M_VERIFIED_REPLY_MISSING');
    return {
      status:'verified_review_reply_published',turnId:linked.turnId,
      taskId:linked.taskId,replyMessageId,reply,replayed:publishedReplay,
      conversationRevision:verified.revision,
      appliedDraftRevision:linked.appliedDraftRevision,
      appliedDraftHash:linked.appliedDraftHash,
      financialSaved:false,draftEditPerformed:false,providerCalls:0,
    };
  }
  async current(token:string,raw:unknown){
    const scope=await this.auth(token,raw as R07RequestEnvelope);
    return this.deps.journal.readOperationalState(scope);
  }
  async history(token:string,raw:unknown){
    const scope=await this.auth(token,raw as R07RequestEnvelope);
    return this.deps.journal.auditFullHistory(scope);
  }
}
