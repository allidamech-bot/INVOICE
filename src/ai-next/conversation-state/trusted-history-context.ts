/**
 * R07P trusted context from the existing full audited R07J history and
 * the existing R07D verified unsaved draft repository.
 *
 * No source-document readers, financial API, provider or new storage root.
 * Full history is intentionally expensive; never use on a local greeting.
 * Fail closed on missing integrity, too many candidates, or unreadable drafts.
 */
import type {AuthenticatedScope,ReviewDraft} from '../domain/contracts.js';
import {validateAuthenticatedScope} from '../domain/validation.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import type {ConversationSnapshot} from '../conversation-state/event-store.js';
import type {R07PTrustedContext,R07PContextReader}
  from '../router/semantic-planner.js';

export const R07P_TRUSTED_HISTORY_CONTEXT_ACTIVATED=false as const;
const MAX_AUDITED_EVENTS=3000;
const MAX_DRAFTS=100;
const clone=<T>(x:T):T=>structuredClone(x);
export interface R07PHistoryAuthority{
  auditFullHistory(scope:AuthenticatedScope):Promise<ConversationSnapshot>;
}
export interface R07PDraftAuthority{
  read(scope:AuthenticatedScope,originTurnId:string):Promise<ReviewDraft|null>;
}
export class R07PTrustedHistoryContext implements R07PContextReader{
  constructor(private readonly journal:R07PHistoryAuthority,
    private readonly drafts:R07PDraftAuthority){}
  async load(scope:AuthenticatedScope):Promise<R07PTrustedContext>{
    if(!validateAuthenticatedScope(scope))throw Error('R07P_CONTEXT_INVALID_SCOPE');
    const key=exactScopeKey(scope);
    // Never substitute the current-turn R07L materialization for history.
    // auditFullHistory independently checks all event hashes, chain and scope.
    const audit=await this.journal.auditFullHistory(scope);
    if(!audit||audit.schemaVersion!==1||audit.scopeKey!==key||
      !Number.isSafeInteger(audit.revision)||audit.revision<0||
      audit.revision>MAX_AUDITED_EVENTS||
      !Array.isArray(audit.turns)||!Array.isArray(audit.tasks)||
      audit.turns.length>MAX_DRAFTS*10||
      audit.tasks.length!==audit.turns.length)
      throw Error('R07P_CONTEXT_INCOMPLETE_OR_UNBOUNDED_HISTORY');
    const byTurn=new Map(audit.turns.map(t=>[t.turnId,t]));
    if(byTurn.size!==audit.turns.length)
      throw Error('R07P_CONTEXT_DUPLICATE_TURN');
    const candidates:ReviewDraft[]=[];
    for(const task of audit.tasks){
      if(task.scope&&exactScopeKey(task.scope)!==key)
        throw Error('R07P_CONTEXT_FOREIGN_TASK');
      if(!task.draftId)continue;
      const turn=byTurn.get(task.turnId);
      if(!turn||exactScopeKey(turn.scope)!==key||
        task.state!=='completed'||
        task.taskType!=='local_draft_start'||
        task.draftId!=='draft-'+turn.turnId)
        throw Error('R07P_CONTEXT_UNVERIFIED_DRAFT_TURN');
      if(candidates.length>=MAX_DRAFTS)
        throw Error('R07P_CONTEXT_TOO_MANY_DRAFTS');
      const stored=await this.drafts.read(scope,turn.turnId);
      if(!stored||stored.schemaVersion!==1||
        exactScopeKey(stored.scope)!==key||
        stored.threadId!==scope.threadId||
        stored.draftId!==task.draftId||
        stored.kind!=='quotation'||
        stored.approvalReceiptId!==null||
        stored.status!=='needs_review'||
        !Number.isSafeInteger(stored.draftRevision)||
        stored.draftRevision<1||
        !Array.isArray(stored.lineItems)||
        stored.lineItems.length>120)
        throw Error('R07P_CONTEXT_MISSING_OR_INVALID_DRAFT');
      candidates.push(stored);
    }
    // A single remaining unsaved review draft can be the active target.
    // If two drafts coexist, "it / last draft" is ambiguous; neither
    // earlier creation order nor most recently edited means user intent.
    const active=candidates.length===1?candidates[0]!:null;
    const refs=candidates.map(d=>({
      kind:'draft' as const,id:d.draftId,
      documentKind:'quotation' as const,scopeKey:key,
    }));
    return clone({
      scopeKey:key,historyComplete:true,
      activeDraft:active?{
        id:active.draftId,kind:'quotation' as const,
        revision:active.draftRevision,lineIds:active.lineItems.map(l=>l.lineId),
      }:null,
      references:refs,
    });
  }
}
