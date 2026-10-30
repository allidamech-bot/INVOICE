/**
 * R04 approval receipts, scoped to EXACT draft/source/business revision.
 *
 * No production execution path exists. This is a synthetic transactional
 * reference design. Before any live use, a server-only durable DB, server
 * HMAC secret, verified Firebase session, ACLs and a domain-level exactly-once
 * financial adapter must be independently proven and approved.
 */
import type {AuthenticatedScope, ApprovalReceipt, ReviewDraft} from '../domain/contracts.js';
import {assertCoreContract} from '../domain/validation.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {assertDraftIntegrity, reviewHash, R04ReviewError, R04_LIVE_WRITES_ENABLED} from './drafts.js';

export const R04_APPROVED_TOOL='document.createDraft' as const;
export type ApprovalStatus='approved'|'rejected'|'revoked'|'needs_reconciliation'|'verified';
export interface ApprovalEntry {
  receipt:ApprovalReceipt;
  status:ApprovalStatus;
  revision:number;
  requestFingerprint:string;
}
export interface ApprovalCollection {revision:number;entries:ApprovalEntry[];}
export interface AtomicApprovalStore {
  transaction<T>(scopeKey:string,fn:(state:ApprovalCollection)=>
    Promise<{next:ApprovalCollection;result:T}>):Promise<T>;
  read(scopeKey:string):Promise<ApprovalCollection>;
}
const clone=<T>(v:T):T=>structuredClone(v);
const validId=(x:string):boolean=>typeof x==='string'&&x.length>0&&x.length<=160 &&
  !/[\u0000-\u001f\u007f]/u.test(x);
const date=(x:string):number=>typeof x==='string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)?Date.parse(x):NaN;
const canonical=(v:unknown):string=>{
  if(v===null||typeof v==='string'||typeof v==='number'||typeof v==='boolean')
    return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v&&typeof v==='object')
    return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b))
      .map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';
  throw new Error('AI_NEXT_INVALID_APPROVAL_JSON');
};
function rawReceipt(r:ApprovalReceipt):unknown{
  const {serverIntegrityTag,...payload}=r;
  return payload;
}
async function tag(key:CryptoKey,payload:unknown):Promise<string>{
  const bytes=new TextEncoder().encode(canonical(payload));
  const hmac=await crypto.subtle.sign('HMAC',key,bytes);
  return Array.from(new Uint8Array(hmac),v=>v.toString(16).padStart(2,'0')).join('');
}
async function seal(key:CryptoKey,r:ApprovalReceipt):Promise<ApprovalReceipt>{
  r.serverIntegrityTag=await tag(key,rawReceipt(r));
  assertCoreContract('ApprovalReceipt',r);
  return r;
}
export async function syntheticApprovalKey():Promise<CryptoKey>{
  return crypto.subtle.generateKey(
    {name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export class SyntheticApprovalStore implements AtomicApprovalStore {
  private state=new Map<string,ApprovalCollection>();
  private locks=new Map<string,Promise<void>>();
  async transaction<T>(k:string,fn:(s:ApprovalCollection)=>
    Promise<{next:ApprovalCollection;result:T}>):Promise<T>{
    const previous=this.locks.get(k)??Promise.resolve();
    let unlock:()=>void=()=>{};const pending=new Promise<void>(r=>{unlock=r;});
    const chain=previous.then(()=>pending);this.locks.set(k,chain);
    await previous;
    try{
      const initial=clone(this.state.get(k)??{revision:0,entries:[]});
      const x=await fn(initial);
      if(x.next.revision<initial.revision||x.next.revision>initial.revision+1||
        x.next.entries.length>5000)
        throw new R04ReviewError('INVALID_APPROVAL_TRANSACTION');
      this.state.set(k,clone(x.next));
      return clone(x.result);
    }finally{unlock();if(this.locks.get(k)===chain)this.locks.delete(k);}
  }
  async read(k:string):Promise<ApprovalCollection>{
    if(this.locks.has(k))await this.locks.get(k);
    return clone(this.state.get(k)??{revision:0,entries:[]});
  }
}
export interface TrustedReviewedDraft {
  draft:ReviewDraft;
  reviewedBusinessRevision:string;
  reviewedSourceManifestHash:string;
  reviewedByActorId:string;
}
export interface TrustedFinanceReadBoundary {
  /** Authoritative server review record, NOT a client-owned draft object. */
  loadReviewDraft(scope:AuthenticatedScope,draftId:string):Promise<TrustedReviewedDraft|null>;
  /** Server fetches the authoritative company/vault baseline. */
  currentBusinessRevision(scope:AuthenticatedScope):Promise<string>;
  /** Independent finance ACL, not just the user's AI mode or role string. */
  canCreateQuoteDraft(scope:AuthenticatedScope):Promise<boolean>;
}
export interface ExplicitHumanApproval {
  control:'approve_current_revision';
  actorId:string;
  draftId:string;
  reviewedDraftRevision:number;
  reviewedDraftHash:string;
  acknowledgedBusinessRevision:string;
  submittedAt:string;
  interactionId:string;
}
/** This approval never directly creates or saves a quotation. */
export class ScopedApprovalGate {
  constructor(
    private readonly key:CryptoKey,
    private readonly store:AtomicApprovalStore,
    private readonly trusted:TrustedFinanceReadBoundary,
  ){}
  private async current(input:{
    scope:AuthenticatedScope;draftId:string;businessRevision:string;
  }):Promise<ReviewDraft>{
    const {scope,draftId,businessRevision}=input;
    if(scope.scopeType!=='business'||!['owner','admin','sales','finance'].includes(scope.role)||
      !await this.trusted.canCreateQuoteDraft(scope))
      throw new R04ReviewError('FINANCIAL_ROLE_OR_SCOPE_DENIED');
    const trustedRecord=await this.trusted.loadReviewDraft(scope,draftId);
    const draft=trustedRecord?.draft;
    if(!draft||!trustedRecord ||
      trustedRecord.reviewedByActorId!==scope.actorId ||
      trustedRecord.reviewedBusinessRevision!==businessRevision ||
      trustedRecord.reviewedSourceManifestHash!==draft.sourceManifestHash ||
      exactScopeKey(draft.scope)!==exactScopeKey(scope)||
      draft.draftId!==draftId||draft.kind!=='quotation'||
      draft.status!=='ready_for_approval'||!draft.businessValidation.valid||
      draft.businessValidation.blockers.length||
      draft.fieldStatus.some(f=>f.status!=='verified'&&f.status!=='not_applicable'))
      throw new R04ReviewError('DRAFT_NOT_REVIEWED_OR_SCOPE_MISMATCH');
    await assertDraftIntegrity(draft);
    if(!businessRevision||await this.trusted.currentBusinessRevision(scope)!==businessRevision)
      throw new R04ReviewError('BUSINESS_REVISION_CHANGED');
    return draft;
  }
  async issue(input:{
    scope:AuthenticatedScope;taskId:string;approvalId:string;operationId:string;
    durationSeconds:number;issuedAt:string;approval:ExplicitHumanApproval;
  }):Promise<ApprovalReceipt>{
    const {scope,approval}=input;
    const key=exactScopeKey(scope),now=date(input.issuedAt),approvedAt=date(approval?.submittedAt);
    if(!validId(input.taskId)||!validId(input.approvalId)||!validId(input.operationId)||
      !Number.isFinite(now)||!Number.isFinite(approvedAt)||
      Math.abs(approvedAt-now)>60_000||
      !Number.isSafeInteger(input.durationSeconds)||input.durationSeconds<30||
      input.durationSeconds>900||
      approval?.control!=='approve_current_revision'||approval.actorId!==scope.actorId||
      !validId(approval.draftId)||!validId(approval.interactionId)||
      !Number.isSafeInteger(approval.reviewedDraftRevision)||
      !/^[a-f0-9]{64}$/.test(approval.reviewedDraftHash)||
      !validId(approval.acknowledgedBusinessRevision))
      throw new R04ReviewError('EXPLICIT_HUMAN_APPROVAL_REQUIRED');
    const draft=await this.current({scope,draftId:approval.draftId,
      businessRevision:approval.acknowledgedBusinessRevision});
    if(draft.draftRevision!==approval.reviewedDraftRevision||
      draft.immutableRevisionHash!==approval.reviewedDraftHash)
      throw new R04ReviewError('REVIEWED_DRAFT_CHANGED');
    const requestFingerprint=await reviewHash({scope,taskId:input.taskId,
      approvalId:input.approvalId,operationId:input.operationId,
      durationSeconds:input.durationSeconds,issuedAt:input.issuedAt,approval});
    return this.store.transaction(key,async state=>{
      const collision=state.entries.find(x=>x.receipt.approvalReceiptId===input.approvalId ||
        x.receipt.operationId===input.operationId);
      if(collision){
        const r=collision.receipt;
        if(collision.status!=='approved')
          throw new R04ReviewError('APPROVAL_TERMINAL_TOMBSTONE');
        if(collision.requestFingerprint!==requestFingerprint ||
          r.approvalReceiptId!==input.approvalId||r.operationId!==input.operationId||
          r.taskId!==input.taskId||r.draftId!==draft.draftId||
          r.draftRevision!==draft.draftRevision||
          r.immutableRevisionHash!==draft.immutableRevisionHash||
          r.expectedBusinessRevision!==approval.acknowledgedBusinessRevision)
          throw new R04ReviewError('APPROVAL_OPERATION_COLLISION');
        return {next:state,result:clone(r)};
      }
      const receipt=await seal(this.key,{
        schemaVersion:1,scope:clone(scope),approvalReceiptId:input.approvalId,
        taskId:input.taskId,actorId:scope.actorId,verifiedRole:scope.role,
        authPolicyVersion:scope.authorizationVersion,toolId:R04_APPROVED_TOOL,
        operationId:input.operationId,draftId:draft.draftId,
        draftRevision:draft.draftRevision,
        immutableRevisionHash:draft.immutableRevisionHash,
        sourceManifestHash:draft.sourceManifestHash,
        expectedBusinessRevision:approval.acknowledgedBusinessRevision,
        issuedAt:input.issuedAt,expiresAt:new Date(now+input.durationSeconds*1000).toISOString(),
        revokedAt:null,approvalAction:'accepted',serverIntegrityTag:'pending',
        consumedAt:null,executionResultRef:null,
      });
      const entry:ApprovalEntry={receipt,status:'approved',revision:1,requestFingerprint};
      return {next:{revision:state.revision+1,entries:[...state.entries,entry]},result:receipt};
    });
  }
  async verify(input:{
    scope:AuthenticatedScope;approvalId:string;draftId:string;
    businessRevision:string;now:string;
  }):Promise<{eligibleForReadOnlyPlanning:true;liveExecutionAuthorized:false;receipt:ApprovalReceipt}>{
    const scopeKey=exactScopeKey(input.scope),now=date(input.now);
    if(!Number.isFinite(now))throw new R04ReviewError('INVALID_APPROVAL_TIME');
    const store=await this.store.read(scopeKey);
    const entry=store.entries.find(x=>x.receipt.approvalReceiptId===input.approvalId);
    if(!entry||entry.status!=='approved'||entry.receipt.approvalAction!=='accepted'||
      entry.receipt.revokedAt||entry.receipt.consumedAt||
      Date.parse(entry.receipt.expiresAt)<=now)
      throw new R04ReviewError('APPROVAL_INVALID_EXPIRED_OR_REVOKED');
    const receipt=entry.receipt;
    if(receipt.serverIntegrityTag!==await tag(this.key,rawReceipt(receipt))||
      exactScopeKey(receipt.scope)!==scopeKey||
      receipt.actorId!==input.scope.actorId||
      receipt.verifiedRole!==input.scope.role||
      receipt.authPolicyVersion!==input.scope.authorizationVersion||
      receipt.toolId!==R04_APPROVED_TOOL)
      throw new R04ReviewError('APPROVAL_INTEGRITY_OR_SCOPE_FAILED');
    const draft=await this.current({scope:input.scope,draftId:input.draftId,
      businessRevision:input.businessRevision});
    if(receipt.draftId!==draft.draftId ||
      receipt.draftRevision!==draft.draftRevision ||
      receipt.immutableRevisionHash!==draft.immutableRevisionHash ||
      receipt.sourceManifestHash!==draft.sourceManifestHash ||
      receipt.expectedBusinessRevision!==input.businessRevision)
      throw new R04ReviewError('APPROVAL_STALE_DRAFT_OR_SOURCE');
    return {eligibleForReadOnlyPlanning:true,liveExecutionAuthorized:false,receipt:clone(receipt)};
  }
  async invalidate(input:{
    scope:AuthenticatedScope;approvalId:string;actorId:string;
    action:'rejected'|'revoked';now:string;
  }):Promise<ApprovalReceipt>{
    const k=exactScopeKey(input.scope);
    if(input.actorId!==input.scope.actorId||!Number.isFinite(date(input.now)))
      throw new R04ReviewError('INVALID_APPROVAL_REVOKER');
    return this.store.transaction(k,async s=>{
      const index=s.entries.findIndex(x=>x.receipt.approvalReceiptId===input.approvalId);
      if(index<0)throw new R04ReviewError('APPROVAL_NOT_FOUND');
      const old=s.entries[index]!,r=old.receipt;
      if(old.status!=='approved')throw new R04ReviewError('APPROVAL_TERMINAL_TOMBSTONE');
      if(date(input.now)<date(r.issuedAt))throw new R04ReviewError('INVALID_APPROVAL_TIME');
      const updated=await seal(this.key,{...r,
        approvalAction:input.action,revokedAt:input.now,consumedAt:null,
        executionResultRef:null,
      });
      const entries=[...s.entries];entries[index]={receipt:updated,
        status:input.action,revision:old.revision+1,
        requestFingerprint:old.requestFingerprint};
      return {next:{revision:s.revision+1,entries},result:updated};
    });
  }
  /** Any future live financial commit is forbidden in this work package. */
  execute():never{
    if(!R04_LIVE_WRITES_ENABLED)throw new R04ReviewError('R04_LIVE_EXECUTION_DISABLED');
    throw new R04ReviewError('R04_NO_FINANCIAL_ADAPTER');
  }
}
