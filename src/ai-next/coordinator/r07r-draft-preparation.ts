/**
 * R07R — disabled, review-only draft preparation bridge.
 *
 * This is NOT a second turn coordinator. It requires the existing R07B
 * membership authority, a planner-produced R01 GroundedIntent, R04's
 * canonical review editor, and R07D's transactional compare-and-swap.
 * All examples use an explicitly injected synthetic semantic interpreter.
 * Real model inference, approval, financial document saving and issuance are
 * absent. Caller must separately journal durable turns before future release.
 */
import type {AuthenticatedScope,ReviewDraft} from '../domain/contracts.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {validateRequest,type R07LocalTurnInput,type R07LocalError}
  from './local-coordinator.js';
import {authorizeR07ScopedRequest,
  type R07AuthenticatedPrincipalVerifier,
  type R07ServerMembershipStore,
  type R07RequestEnvelope} from '../security/server-membership.js';
import {R07PSemanticPlanner} from '../router/semantic-planner.js';
import {R07DExperimentalFirestoreDraftStore} from '../storage/firestore-review-drafts.js';
import {SyntheticDraftEditor,type DraftEditorChange,type ReviewLine}
  from '../guarded-finance/drafts.js';

export const R07R_REVIEW_PREPARATION_ACTIVATED=false as const;
const HASH=/^[a-f0-9]{64}$/u;
const safeId=(v:unknown):v is string=>typeof v==='string'&&
  v.length>0&&v.length<=160&&!/[\u0000-\u001f\u007f]/u.test(v);
const numeric=(value:string,strictPositive=false)=>/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/u.test(value)&&
  (!strictPositive||Number(value)>0);
const safeCurrency=(v:string):boolean=>/^[A-Z]{3}$/u.test(v);
const clone=<T>(x:T):T=>structuredClone(x);
const ownKeys=(v:unknown,required:readonly string[]):v is Record<string,unknown>=>{
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.getPrototypeOf(v)!==Object.prototype)return false;
  const keys=Object.keys(v).sort(),expected=[...required].sort();
  return keys.length===expected.length&&keys.every((x,i)=>x===expected[i]);
};
export class R07RPreparationError extends Error{
  constructor(readonly code:string){super(code);}
}
export interface R07RPrepareInput{
  turn:R07LocalTurnInput;
  expectedDraftRevision:number;
  expectedDraftHash:string;
}
export interface R07RTrustedCustomerResolver{
  /** Returns an exact server-verified single customer ID, never invents one. */
  resolveUnique(scope:AuthenticatedScope,requestedName:string):Promise<string|null>;
}
export interface R07RPreparedEdit{
  state:'unsaved_review_revision';
  draft:ReviewDraft;
  reviewRequired:true;
  financialSaved:false;
  /** Synthetic-only NLU; no production model transports are available here. */
  liveProviderCalls:0;
  requestId:string;
}
const envelope=(turn:R07LocalTurnInput):R07RequestEnvelope=>({
  schemaVersion:1,accountId:turn.accountId,companyId:turn.companyId,
  branchId:turn.branchId,threadId:turn.threadId,scopeType:turn.scopeType,
});
function factsFromPlan(input:Awaited<ReturnType<R07PSemanticPlanner['plan']>>):
  Map<string,string>{
  const facts=input.intent.argumentFacts;
  const output=new Map<string,string>();
  for(const f of facts){
    if(f.provenanceStatus!=='uncertain'||f.evidenceRefs.length||
      f.value===null||f.originalText!==f.value||output.has(f.name))
      throw new R07RPreparationError('R07R_UNTRUSTED_FACT');
    output.set(f.name,f.value);
  }
  const allowed=[
    'customer_name','operation','description','quantity',
    'unit','selling_unit_price','currency','line_id',
  ];
  if([...output.keys()].some(x=>!allowed.includes(x)))
    throw new R07RPreparationError('R07R_UNSUPPORTED_DRAFT_FIELDS');
  return output;
}
function selectLine(draft:ReviewDraft,facts:Map<string,string>):string{
  const requested=facts.get('line_id');
  if(requested){
    if(!draft.lineItems.some(line=>line.lineId===requested))
      throw new R07RPreparationError('R07R_UNKNOWN_LINE');
    return requested;
  }
  if(draft.lineItems.length!==1)
    throw new R07RPreparationError('R07R_AMBIGUOUS_LINE');
  return draft.lineItems[0]!.lineId;
}
function ensureExactly(actual:ReadonlyMap<string,string>,allowed:readonly string[]){
  if([...actual.keys()].some(x=>!allowed.includes(x)))
    throw new R07RPreparationError('R07R_MULTI_TARGET_REQUIRES_BATCH');
}
async function editorChange(draft:ReviewDraft,facts:Map<string,string>,
  scope:AuthenticatedScope,customers:R07RTrustedCustomerResolver):
  Promise<DraftEditorChange>{
  if(facts.has('customer_name')){
    ensureExactly(facts,['customer_name']);
    const alias=facts.get('customer_name')!;
    if(!safeId(alias))throw new R07RPreparationError('R07R_INVALID_CUSTOMER_ALIAS');
    const id=await customers.resolveUnique(scope,alias);
    if(!safeId(id))throw new R07RPreparationError('R07R_CUSTOMER_NOT_UNIQUELY_VERIFIED');
    return {kind:'set_customer',customerId:id};
  }
  const operation=facts.get('operation');
  if(operation==='remove_line'){
    ensureExactly(facts,['operation','line_id']);
    return {kind:'remove_line',lineId:selectLine(draft,facts)};
  }
  if(operation==='append_line'){
    ensureExactly(facts,[
      'operation','description','quantity','unit','selling_unit_price','currency',
    ]);
    const description=facts.get('description'),quantity=facts.get('quantity');
    const unit=facts.get('unit'),price=facts.get('selling_unit_price');
    const currency=facts.get('currency');
    if(!description||description.length>3000||!unit||!safeId(unit)||
      !quantity||!numeric(quantity,true)||price===undefined||
      !numeric(price)||!currency||!safeCurrency(currency)||
      draft.currency!==currency)
      throw new R07RPreparationError('R07R_INCOMPLETE_LINE_DATA');
    const line:ReviewLine={
      lineId:'line-r07r-'+crypto.randomUUID(),description,quantity,
      unit,sellingUnitPrice:price,currency,evidenceRefs:[],
    };
    return {kind:'append_line',line};
  }
  if(operation!==undefined)
    throw new R07RPreparationError('R07R_UNKNOWN_OPERATION');
  if(facts.has('currency')){
    ensureExactly(facts,['currency']);
    const newCurrency=facts.get('currency')!;
    if(!safeCurrency(newCurrency)||draft.lineItems.length>0)
      throw new R07RPreparationError('R07R_CURRENCY_REVIEW_REQUIRED');
    return {kind:'set_currency',currency:newCurrency};
  }
  ensureExactly(facts,['line_id','quantity','unit','selling_unit_price']);
  const patch:Extract<DraftEditorChange,{kind:'line_patch'}>['patch']={};
  if(facts.has('quantity')){
    const v=facts.get('quantity')!;
    if(!numeric(v,true))throw new R07RPreparationError('R07R_INVALID_QUANTITY');
    patch.quantity=v;
  }
  if(facts.has('selling_unit_price')){
    const v=facts.get('selling_unit_price')!;
    if(!numeric(v))throw new R07RPreparationError('R07R_INVALID_PRICE');
    patch.sellingUnitPrice=v;
  }
  if(facts.has('unit')){
    const v=facts.get('unit')!;
    if(!safeId(v))throw new R07RPreparationError('R07R_INVALID_UNIT');
    patch.unit=v;
  }
  if(!Object.keys(patch).length)
    throw new R07RPreparationError('R07R_NO_SUPPORTED_EDIT');
  return {kind:'line_patch',lineId:selectLine(draft,facts),patch};
}
export class R07RReviewDraftPreparationBridge{
  constructor(private readonly deps:{
    principal:R07AuthenticatedPrincipalVerifier;
    membership:R07ServerMembershipStore;
    planner:R07PSemanticPlanner;
    draftStore:Pick<R07DExperimentalFirestoreDraftStore,
      'read'|'replaceReviewRevision'>;
    customers:R07RTrustedCustomerResolver;
    clock?:()=>Date;
  }){}
  async prepare(token:string,raw:unknown):Promise<R07RPreparedEdit>{
    if(!ownKeys(raw,['turn','expectedDraftRevision','expectedDraftHash']))
      throw new R07RPreparationError('R07R_INVALID_INPUT');
    validateRequest(raw.turn);
    const input=raw as unknown as R07RPrepareInput;
    if(!Number.isSafeInteger(input.expectedDraftRevision)||
      input.expectedDraftRevision<1||
      !HASH.test(input.expectedDraftHash))
      throw new R07RPreparationError('R07R_INVALID_REVISION');
    const turn=input.turn;
    // Reauthorize at the boundary. Mode selected by a browser cannot grant
    // owner/admin rights or grant financial execution.
    const scope=await authorizeR07ScopedRequest({
      bearerToken:token,body:envelope(turn),principal:this.deps.principal,
      membership:this.deps.membership,
      serverNowEpochSeconds:Math.floor((this.deps.clock?.()??new Date()).getTime()/1000),
    });
    if(turn.mode!=='controller'||scope.scopeType!=='business'||scope.role==='viewer')
      throw new R07RPreparationError('R07R_PREPARATION_DENIED');
    const proposed=await this.deps.planner.plan(token,turn);
    if(proposed.status!=='proposed'||proposed.risk!=='preparation'||
      proposed.interpretation!=='synthetic_model'||
      proposed.intent.action!=='edit_draft'||
      proposed.intent.executable!==false||
      proposed.intent.subjectRef?.kind!=='draft'||
      proposed.intent.missingFields.length||
      proposed.intent.unresolvedReferences.length||
      proposed.intent.contradictoryFields.length||
      proposed.intent.referencedSourceIds.length||
      exactScopeKey(proposed.intent.scope)!==exactScopeKey(scope))
      throw new R07RPreparationError('R07R_UNSAFE_OR_UNRESOLVED_PLAN');
    const draftId=proposed.intent.subjectRef.id;
    if(!draftId.startsWith('draft-')||
      !safeId(draftId.slice('draft-'.length)))
      throw new R07RPreparationError('R07R_INVALID_DRAFT_REFERENCE');
    const originTurnId=draftId.slice('draft-'.length);
    const draft=await this.deps.draftStore.read(scope,originTurnId);
    if(!draft||draft.draftId!==draftId||
      draft.threadId!==scope.threadId||
      exactScopeKey(draft.scope)!==exactScopeKey(scope)||
      draft.status!=='needs_review'||draft.kind!=='quotation'||
      draft.approvalReceiptId!==null)
      throw new R07RPreparationError('R07R_NO_VERIFIED_REVIEW_DRAFT');
    if(draft.draftRevision!==input.expectedDraftRevision||
      draft.immutableRevisionHash!==input.expectedDraftHash)
      throw new R07RPreparationError('R07R_STALE_DRAFT');
    const change=await editorChange(draft,factsFromPlan(proposed),
      scope,this.deps.customers);
    const editor=await SyntheticDraftEditor.resume(draft);
    const next=await editor.edit({
      expectedRevision:input.expectedDraftRevision,change,
      now:new Date(Math.max(
        (this.deps.clock?.()??new Date()).getTime(),
        Date.parse(draft.updatedAt),
      )).toISOString(),
    });
    // Only R07D owns the compare-and-swap write. A network ambiguity causes
    // a stale revision on retry, never a duplicate application.
    const persisted=await this.deps.draftStore.replaceReviewRevision({
      scope,turnId:originTurnId,expectedRevision:input.expectedDraftRevision,
      expectedHash:input.expectedDraftHash,next,
    });
    if(persisted.draftRevision!==input.expectedDraftRevision+1||
      persisted.draftId!==draftId||
      persisted.immutableRevisionHash!==next.immutableRevisionHash||
      persisted.status!=='needs_review'||persisted.approvalReceiptId!==null)
      throw new R07RPreparationError('R07R_UNVERIFIED_EDIT_RECEIPT');
    return {
      state:'unsaved_review_revision',draft:clone(persisted),
      reviewRequired:true,financialSaved:false,liveProviderCalls:0,
      requestId:turn.requestId,
    };
  }
}
