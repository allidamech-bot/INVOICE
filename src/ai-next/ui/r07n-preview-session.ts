/**
 * R07N: OFFLINE preview bridge — R07M authenticated server port to R06 view
 * contract. Deliberately no HTTP endpoint, Firebase client, React mount,
 * provider call, financial writer, token persistence, or background retries.
 *
 * The port MUST be implemented by an authenticated server boundary and MUST
 * independently re-authorize each call. A browser-only port is not proof of
 * authority. The R06 component remains gated OFF.
 */
import type {AuthenticatedScope,ReviewDraft} from '../domain/contracts.js';
import type {R07LocalResult,R07LocalTurnInput} from '../coordinator/local-coordinator.js';
import type {ConversationSnapshot} from '../conversation-state/event-store.js';
import type {R07LOperationalView} from '../storage/firestore-indexed-append.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import type {R07MUnifiedReviewEditResult} from '../coordinator/fast-local-coordinator.js';
import {fingerprintR07RReviewRequest,type R07RReceiptPrepareInput}
  from '../coordinator/r07r-draft-preparation.js';
import {assertR06Scope,type R06ConversationView,type R06Message}
  from './view-model.js';

export const R07N_PREVIEW_BRIDGE_ACTIVATED=false as const;
export class R07NPreviewError extends Error{
  constructor(readonly code:string){super(code);}
}
export type R07NEnvelope=Pick<R07LocalTurnInput,'schemaVersion'|'accountId'|
  'companyId'|'branchId'|'threadId'|'scopeType'>;
export type R07NIdentity=Pick<R07LocalTurnInput,'requestId'|'idempotencyKey'|
  'userMessageId'>;
export type R07NPreviewPending=R07LocalTurnInput;
/** Local UI callbacks never receive a Firebase Admin instance or bearer token. */
export interface R07NAuthenticatedPreviewPort{
  accept(request:R07LocalTurnInput):Promise<R07LocalResult>;
  /** Optional local-loopback receipt transport, never a production route. */
  reviewEdit?(request:R07RReceiptPrepareInput):
    Promise<R07MUnifiedReviewEditResult>;
  current(envelope:R07NEnvelope):Promise<{
    view:R07LOperationalView;
    completeHistory:false;
    authoritativeForFinancialExecution:false;
  }>;
  history(envelope:R07NEnvelope):Promise<ConversationSnapshot>;
}
const same=(a:AuthenticatedScope,b:AuthenticatedScope)=>
  exactScopeKey(a)===exactScopeKey(b);
const plain=(v:unknown):v is Record<string,unknown>=>
  !!v&&typeof v==='object'&&!Array.isArray(v)&&
    Object.getPrototypeOf(v)===Object.prototype;
const checkPending=(v:unknown,envelope:R07NEnvelope):R07LocalTurnInput=>{
  const fields=['schemaVersion','accountId','companyId','branchId','threadId',
    'scopeType','requestId','idempotencyKey','userMessageId','message','mode'];
  if(!plain(v)||Object.keys(v).sort().join('|')!==fields.sort().join('|')||
    v.schemaVersion!==1||v.accountId!==envelope.accountId||
    v.companyId!==envelope.companyId||v.branchId!==envelope.branchId||
    v.threadId!==envelope.threadId||v.scopeType!==envelope.scopeType||
    !['advisor','controller'].includes(String(v.mode))||
    typeof v.message!=='string'||!v.message.trim()||v.message.length>6000||
    ['requestId','idempotencyKey','userMessageId'].some(key=>
      typeof v[key]!=='string'||!(v[key] as string).trim()||
      (v[key] as string).length>160))
    throw new R07NPreviewError('R07N_INVALID_PENDING_REQUEST');
  return structuredClone(v as unknown as R07LocalTurnInput);
};
const matchReview=(a:R07RReceiptPrepareInput,b:R07RReceiptPrepareInput)=>
  JSON.stringify(a)===JSON.stringify(b);
function checkReviewRequest(input:unknown,envelope:R07NEnvelope):
  R07RReceiptPrepareInput{
  if(!plain(input)||Object.keys(input).sort().join('|')!==[
    'turn','originTurnId','expectedDraftRevision','expectedDraftHash',
  ].sort().join('|'))
    throw new R07NPreviewError('R07N_INVALID_REVIEW_REQUEST');
  const turn=checkPending(input.turn,envelope);
  if(turn.mode!=='controller'||typeof input.originTurnId!=='string'||
    !input.originTurnId.trim()||input.originTurnId.length>160||
    !Number.isSafeInteger(input.expectedDraftRevision)||
    (input.expectedDraftRevision as number)<1||
    typeof input.expectedDraftHash!=='string'||
    !/^[a-f0-9]{64}$/.test(input.expectedDraftHash))
    throw new R07NPreviewError('R07N_INVALID_REVIEW_REQUEST');
  return structuredClone(input as unknown as R07RReceiptPrepareInput);
}
const emptyView=(scope:AuthenticatedScope):R06ConversationView=>({
  scope:structuredClone(scope),threadId:scope.threadId,
  messages:[],attachments:[],memories:[],currentTask:null,draft:null,
});
function checkDraft(scope:AuthenticatedScope,turnId:string,
  draft:ReviewDraft|null):ReviewDraft|null{
  if(!draft)return null;
  if(!same(draft.scope,scope)||draft.threadId!==scope.threadId||
    draft.draftId!=='draft-'+turnId||draft.kind!=='quotation'||
    draft.status!=='needs_review'||draft.approvalReceiptId!==null||
    draft.draftRevision!==1)
    throw new R07NPreviewError('R07N_UNVERIFIED_DRAFT');
  return structuredClone(draft);
}
/** R07L current state is NOT history; render only its actual current turn. */
export function r07nCurrentToR06(scope:AuthenticatedScope,response:Awaited<
  ReturnType<R07NAuthenticatedPreviewPort['current']>>,
  draft:ReviewDraft|null=null):R06ConversationView{
  if(response.completeHistory!==false||
    response.authoritativeForFinancialExecution!==false)
    throw new R07NPreviewError('R07N_UNSAFE_CURRENT_AUTHORITY');
  const v=response.view,key=exactScopeKey(scope);
  if(v.scopeKey!==key||!Number.isSafeInteger(v.revision)||v.revision<0||
    (v.revision>0&&(!v.turn||!v.task))||
    (v.turn&&(!same(v.turn.scope,scope)||v.turn.threadId!==scope.threadId))||
    (v.task&&(!same(v.task.scope,scope)||v.task.threadId!==scope.threadId||
      v.task.turnId!==v.turn?.turnId))||
    (!v.turn&&(v.userMessageSeen||v.assistantReply||draft))||
    (v.assistantReply&&v.assistantReply.messageId!=='assistant-'+v.turn?.turnId)||
    (v.task?.state==='completed'&&(!v.userMessageSeen||!v.assistantReply))||
    (draft&&v.task?.draftId!==draft.draftId))
    throw new R07NPreviewError('R07N_INCONSISTENT_CURRENT');
  const view=emptyView(scope);
  if(v.turn){
    const messages:R06Message[]=[];
    if(v.userMessageSeen)messages.push({
      messageId:v.turn.userMessageId,turnId:v.turn.turnId,role:'user',
      text:v.turn.userMessage.text,sourceIds:[],
      createdAt:v.turn.receivedAt,
    });
    if(v.assistantReply)messages.push({
      messageId:v.assistantReply.messageId,turnId:v.turn.turnId,
      role:'assistant',text:v.assistantReply.text,sourceIds:[],
      // Only the turn timestamp is stored in R07L; this is NOT a
      // fabricated precise assistant-message timestamp.
      createdAt:v.turn.receivedAt,
    });
    view.messages=messages;
    view.currentTask=v.task?structuredClone(v.task):null;
    view.draft=checkDraft(scope,v.turn.turnId,draft);
  }
  assertR06Scope(view,scope);
  return view;
}
/** Full historic view only via an explicitly requested R03-verified read. */
export function r07nHistoryToR06(scope:AuthenticatedScope,
  history:ConversationSnapshot):R06ConversationView{
  const key=exactScopeKey(scope);
  if(history.scopeKey!==key||history.schemaVersion!==1||
    history.turns.some(t=>!same(t.scope,scope))||
    history.tasks.some(t=>!same(t.scope,scope)))
    throw new R07NPreviewError('R07N_HISTORY_SCOPE_MISMATCH');
  const turns=new Map(history.turns.map(t=>[t.turnId,t]));
  if(turns.size!==history.turns.length)
    throw new R07NPreviewError('R07N_DUPLICATE_HISTORY_TURN');
  const messages=history.messages.map(m=>{
    const turn=turns.get(m.turnId);
    if(!turn)throw new R07NPreviewError('R07N_ORPHAN_HISTORY_MESSAGE');
    return {messageId:m.messageId,turnId:m.turnId,role:m.role,
      text:m.text,sourceIds:[...m.sourceIds],
      createdAt:turn.receivedAt};
  });
  const view=emptyView(scope);
  view.messages=messages;
  view.currentTask=history.tasks.at(-1)??null;
  assertR06Scope(view,scope);
  return view;
}
/**
 * One pending request at a time. On uncertain network acknowledgement,
 * retain exact identity+payload for a MANUAL retry; NEVER invent a new key.
 * Aborting a UI request does not prove that a Firestore commit rolled back.
 */
export class R07NPreviewSession{
  private pending:R07LocalTurnInput|null=null;
  private pendingReview:R07RReceiptPrepareInput|null=null;
  private busy=false;
  private view:R06ConversationView;
  constructor(private readonly scope:AuthenticatedScope,
    private readonly envelope:R07NEnvelope,
    private readonly port:R07NAuthenticatedPreviewPort,
    private readonly newIdentity:()=>R07NIdentity=()=>({
      requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),
      userMessageId:crypto.randomUUID(),
    })){
    if(scope.accountId!==envelope.accountId||
      scope.companyId!==envelope.companyId||
      scope.branchId!==envelope.branchId||
      scope.threadId!==envelope.threadId||
      scope.scopeType!==envelope.scopeType||envelope.schemaVersion!==1)
      throw new R07NPreviewError('R07N_SCOPE_ENVELOPE_MISMATCH');
    this.view=emptyView(scope);
  }
  getView():R06ConversationView{return structuredClone(this.view);}
  unresolvedForManualRecovery():R07NPreviewPending|null{
    return this.pending?structuredClone(this.pending):null;
  }
  restoreUnresolved(input:R07NPreviewPending):void{
    if(this.busy||this.pending||this.pendingReview)
      throw new R07NPreviewError('R07N_RECOVERY_PENDING_CONFLICT');
    this.pending=checkPending(input,this.envelope);
  }
  async refreshCurrent():Promise<R06ConversationView>{
    const current=await this.port.current(this.envelope);
    this.view=r07nCurrentToR06(this.scope,current);
    return this.getView();
  }
  async loadVerifiedHistory():Promise<R06ConversationView>{
    const history=await this.port.history(this.envelope);
    this.view=r07nHistoryToR06(this.scope,history);
    return this.getView();
  }
  unresolvedReviewForManualRecovery():R07RReceiptPrepareInput|null{
    return this.pendingReview?structuredClone(this.pendingReview):null;
  }
  restoreUnresolvedReview(input:R07RReceiptPrepareInput):void{
    if(this.busy||this.pending||this.pendingReview)
      throw new R07NPreviewError('R07N_RECOVERY_PENDING_CONFLICT');
    this.pendingReview=checkReviewRequest(input,this.envelope);
  }
  /**
   * One already-guarded R07M/R07D review edit. The R07N view cannot infer a
   * new draft revision from a response alone: it presents only the verified
   * R07J transcript. The real draft stays hidden until a separately
   * authenticated R07D read becomes available. No automatic re-inference.
   */
  async reviewEdit(input:R07RReceiptPrepareInput,signal?:AbortSignal):
    Promise<{accepted:boolean}>{
    if(this.busy||this.pending)
      throw new R07NPreviewError('R07N_REVIEW_ALREADY_IN_FLIGHT');
    const checked=checkReviewRequest(input,this.envelope);
    if(this.pendingReview&&!matchReview(this.pendingReview,checked))
      throw new R07NPreviewError('R07N_PENDING_REVIEW_MISMATCH');
    if(!this.port.reviewEdit)
      throw new R07NPreviewError('R07N_REVIEW_TRANSPORT_DISABLED');
    if(!this.pendingReview){
      const draft=this.view.draft;
      if(!draft||draft.draftId!=='draft-'+checked.originTurnId||
        draft.draftRevision!==checked.expectedDraftRevision||
        draft.immutableRevisionHash!==checked.expectedDraftHash||
        !same(draft.scope,this.scope)||draft.status!=='needs_review'||
        draft.approvalReceiptId!==null)
        throw new R07NPreviewError('R07N_REVIEW_ORIGIN_NOT_VERIFIED');
    }
    if(signal?.aborted)return {accepted:false};
    this.pendingReview??=checked;
    this.busy=true;
    try{
      const response=await this.port.reviewEdit(structuredClone(this.pendingReview));
      // A successful HTTP response is insufficient: R07J must independently
      // confirm task completion, request binding, receipt and final reply.
      const history=await this.port.history(this.envelope);
      const safe=r07nHistoryToR06(this.scope,history);
      const request=this.pendingReview;
      const turn=history.turns.find(x=>x.turnId===response.turnId);
      const task=history.tasks.find(x=>x.taskId===response.taskId);
      const fingerprint=await fingerprintR07RReviewRequest(request);
      const bound=history.checkpointRefs.filter(x=>
        x.checkpointId==='review-request-'+response.turnId);
      const receipts=history.checkpointRefs.filter(x=>
        x.checkpointId==='review-receipt-'+response.turnId);
      const replies=history.messages.filter(x=>
        x.messageId==='assistant-'+response.turnId);
      const users=history.messages.filter(x=>
        x.messageId===request.turn.userMessageId);
      const applied=response.status==='applied_unsaved_review';
      if(response.financialSaved!==false||response.providerCalls!==0||
        !['applied_unsaved_review','needs_clarification'].includes(response.status)||
        response.threadId!==this.scope.threadId||
        !Number.isSafeInteger(response.conversationRevision)||
        response.conversationRevision>history.revision||
        !turn||!same(turn.scope,this.scope)||turn.mode!=='controller'||
        turn.threadId!==request.turn.threadId||
        turn.requestId!==request.turn.requestId||
        turn.idempotencyKey!==request.turn.idempotencyKey||
        turn.userMessageId!==request.turn.userMessageId||
        turn.userMessage.text!==request.turn.message||
        !task||task.turnId!==turn.turnId||task.state!=='completed'||
        task.taskType!=='unsaved_review_edit'||!same(task.scope,this.scope)||
        bound.length!==1||bound[0]?.taskId!==task.taskId||
        bound[0]?.stage!=='r07m_unsaved_review_request_v1'||
        bound[0]?.referenceHash!==fingerprint||
        replies.length!==1||replies[0]?.role!=='assistant'||
        replies[0]?.turnId!==turn.turnId||replies[0]?.text!==response.reply||
        users.length!==1||users[0]?.role!=='user'||
        users[0]?.turnId!==turn.turnId||
        (applied?(
          receipts.length!==1||receipts[0]?.taskId!==task.taskId||
          receipts[0]?.stage!=='r07r_unsaved_review_edit_receipt_v1'||
          receipts[0]?.referenceHash!==response.appliedDraftHash||
          response.appliedDraftRevision!==request.expectedDraftRevision+1||
          !/^[a-f0-9]{64}$/.test(response.appliedDraftHash??'')
        ):(
          receipts.length!==0||response.appliedDraftRevision!==null||
          response.appliedDraftHash!==null
        )))
        throw new R07NPreviewError('R07N_UNVERIFIED_REVIEW_COMPLETION');
      if(signal?.aborted)return {accepted:false};
      this.view={...safe,draft:null};
      this.pendingReview=null;
      return {accepted:true};
    }catch{
      return {accepted:false};
    }finally{this.busy=false;}
  }
  async send(input:{
    text:string;mode:'advisor'|'controller';sourceIds:readonly string[];
    signal?:AbortSignal;
  }):Promise<{accepted:boolean}>{
    if(this.busy||this.pendingReview)
      throw new R07NPreviewError('R07N_SEND_ALREADY_IN_FLIGHT');
    if(input.sourceIds.length>0)
      throw new R07NPreviewError('R07N_LOCAL_FILES_NOT_SUPPORTED');
    if(!input.text.trim()||input.text.length>6000)
      throw new R07NPreviewError('R07N_INVALID_LOCAL_INPUT');
    if(input.signal?.aborted)return {accepted:false};
    if(this.pending){
      if(this.pending.message!==input.text||this.pending.mode!==input.mode)
        throw new R07NPreviewError('R07N_PENDING_REQUEST_MISMATCH');
    }else{
      const ids=this.newIdentity();
      this.pending=checkPending({
        ...this.envelope,...ids,message:input.text,mode:input.mode,
      },this.envelope);
    }
    this.busy=true;
    try{
      const request=this.pending;
      const response=await this.port.accept(structuredClone(request));
      // A transport success alone is not sufficient. Independently
      // re-authorize current state and verify that this exact turn completed.
      const current=await this.port.current(this.envelope);
      const v=current.view;
      if(response.status!=='completed'||response.financialSaved!==false||
        response.providerCalls!==0||
        response.turnId!==v.turn?.turnId||
        response.taskId!==v.task?.taskId||
        v.turn?.idempotencyKey!==request.idempotencyKey||
        v.turn?.requestId!==request.requestId||
        v.turn?.userMessageId!==request.userMessageId||
        v.turn?.userMessage.text!==request.message||
        v.turn?.mode!==request.mode||
        v.task.state!=='completed'||
        (!!v.task.draftId!==!!response.draft)||
        v.revision<response.conversationRevision||
        v.assistantReply?.text!==response.reply)
        throw new R07NPreviewError('R07N_UNVERIFIED_TURN_COMPLETION');
      const safe=r07nCurrentToR06(this.scope,current,response.draft);
      if(input.signal?.aborted)return {accepted:false};
      this.view=safe;
      this.pending=null;
      return {accepted:true};
    }catch{
      // No automatic replay: caller may manually send the exact same request.
      return {accepted:false};
    }finally{this.busy=false;}
  }
}
