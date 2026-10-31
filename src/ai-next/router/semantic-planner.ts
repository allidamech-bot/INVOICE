/**
 * R07P semantic interpretation seam. Server-only, inactive, proposal-only.
 * R05 deterministic intents take precedence; no inference or financial writes
 * are included here. R07Q must independently authorize any real provider.
 */
import type {AuthenticatedScope,ConversationMode,GroundedIntent} from '../domain/contracts.js';
import {assertCoreContract} from '../domain/validation.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {recognizeR05LocalIntent} from './local-intents.js';
import {recognizeR07PLocalStructuredIntent,
  requiresR07PCompoundClarification,parseR07PStandalonePriceReply,
  parseR07PStandaloneLineReply,parseR07PNamedLineReply,
  resolveR07PNamedLineId}
  from './local-structured-intents.js';
import {authorizeR07ScopedRequest,type R07AuthenticatedPrincipalVerifier,
  type R07ServerMembershipStore,type R07RequestEnvelope}
  from '../security/server-membership.js';
import {validateRequest,type R07LocalTurnInput} from '../coordinator/local-coordinator.js';

export const R07P_SEMANTIC_PRODUCTION_ACTIVE=false as const;
type RefKind='document'|'draft'|'entity';
type Action=GroundedIntent['action'];
type Fact={name:string;value:string};
export interface R07PTrustedReference{
  kind:RefKind;
  id:string;
  /** Trusted typed document metadata, not language-model text. */
  documentKind:'quotation'|'invoice'|'other'|null;
  scopeKey:string;
}
export interface R07PTrustedContext{
  scopeKey:string;
  /** False when the required history has not been audited or loaded. */
  historyComplete:boolean;
  activeDraft:{id:string;kind:'quotation';revision:number;lineIds:string[];
    /** Exactly ordered server-authenticated R07D draft line descriptions. */
    namedLines?:{lineId:string;description:string}[];
  }|null;
  references:R07PTrustedReference[];
  /** Derived from the full audited prior turn; not a client-provided flag. */
  pendingPriceFollowup?:R07PVerifiedPriceFollowup;
  pendingLineFollowup?:R07PVerifiedLineFollowup;
  /** Verified full-audit prior messages only, never a browser-supplied chat. */
  dialogueHistory?:{role:'user'|'assistant';text:string}[];
}
export interface R07PVerifiedPriceFollowup{
  currentUserMessageId:string;
  currentIdempotencyKey:string;
  previousTurnId:string;
  draftId:string;
  draftRevision:number;
  field:'selling_unit_price';
}
/** Single already-clarified quantity + server-verified draft line identity. */
export interface R07PVerifiedLineFollowup{
  currentUserMessageId:string;
  currentIdempotencyKey:string;
  previousTurnId:string;
  draftId:string;
  draftRevision:number;
  field:'quantity';
  value:string;
  lineId:string;
}
export interface R07PContextReader{
  /** Must read only server-verified scoped records; never model-derived data. */
  load(scope:AuthenticatedScope,current?:{
    userMessageId:string;idempotencyKey:string;message:string;
  }):Promise<R07PTrustedContext>;
}
export interface R07PSemanticCandidate{
  action:Action;
  /** A model hint, never an authorization or an unverified database ID. */
  subject:{kind:RefKind;id:string}|null;
  reference:'none'|'active_draft'|'last_quotation'|'last_document';
  facts:Fact[];
  sourceIds:string[];
  missingFields:string[];
}
export interface R07PSyntheticInterpreter{
  /** Only synthetic test payloads may be sent through this R07P interface. */
  interpret(input:{message:string;language:'ar'|'en'|'mixed'|'unknown';
    mode:ConversationMode;knownReferences:{kind:RefKind;id:string}[];
    history?:{role:'user'|'assistant';text:string}[]}):Promise<unknown>;
}
/** The R07Q adapter remains unmounted; a trusted server provides the scope. */
export interface R07PRoutedInterpreter{
  interpret(input:{scope:AuthenticatedScope;
    message:string;language:'ar'|'en'|'mixed'|'unknown';
    mode:ConversationMode;knownReferences:{kind:RefKind;id:string}[]}):
    Promise<
      | {ok:true;candidate:unknown;calls:number}
      | {ok:false;code:string;calls:number}
    >;
}
export type R07PStatus='local_reply'|'proposed'|'needs_clarification'|
  'approval_required'|'unsupported';
export interface R07PPlan{
  status:R07PStatus;
  interpretation:'deterministic'|'synthetic_model'|'routed_model'|'unavailable';
  language:'ar'|'en'|'mixed'|'unknown';
  intent:GroundedIntent;
  risk:'read_only'|'preparation'|'approval'|'blocked';
  /** Live attempts, or one synthetic invocation in test-only mode. */
  providerCalls:number;
  /** No review draft, real document or financial record is ever persisted. */
  financialSaved:false;
  assistantReply:string|null;
}
const actions:readonly Action[]=[
  'discuss','read_file','read_business','prepare_quote','edit_draft',
  'preview_draft','analyze','request_approval','execute_approved','clarify','cancel',
];
const referenceKinds:readonly RefKind[]=['document','draft','entity'];
const identifier=(v:unknown):v is string=>typeof v==='string'&&
  v.length>0&&v.length<=160&&!/[\u0000-\u001f\u007f]/u.test(v);
const text=(v:unknown,max=6000):v is string=>typeof v==='string'&&
  v.length>0&&v.length<=max&&!/[\u0000-\u0008\u000b\u000e-\u001f]/u.test(v);
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&
  typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const keys=(v:Record<string,unknown>,required:readonly string[])=>{
  const found=Object.keys(v).sort(),want=[...required].sort();
  return found.length===want.length&&found.every((x,i)=>x===want[i]);
};
const unique=(ids:readonly string[])=>new Set(ids).size===ids.length;
const copy=<T>(x:T):T=>structuredClone(x);
const languageOf=(message:string):R07PPlan['language']=>{
  const ar=/[\u0621-\u064a]/u.test(message);
  const en=/[a-z]/iu.test(message);
  return ar&&en?'mixed':ar?'ar':en?'en':'unknown';
};
export function parseR07PSemanticCandidate(raw:unknown):R07PSemanticCandidate{
  if(!record(raw)||!keys(raw,[
    'action','subject','reference','facts','sourceIds','missingFields',
  ])||!actions.includes(raw.action as Action)||
    !['none','active_draft','last_quotation','last_document'].includes(
      raw.reference as string)||
    (raw.subject!==null&&(!record(raw.subject)||
      !keys(raw.subject,['kind','id'])||
      !referenceKinds.includes(raw.subject.kind as RefKind)||
      !identifier(raw.subject.id)))||
    !Array.isArray(raw.facts)||raw.facts.length>30||
    !raw.facts.every(f=>record(f)&&keys(f,['name','value'])&&
      identifier(f.name)&&text(f.value,2000))||
    !Array.isArray(raw.sourceIds)||raw.sourceIds.length>30||
    !raw.sourceIds.every(identifier)||!unique(raw.sourceIds)||
    !Array.isArray(raw.missingFields)||raw.missingFields.length>30||
    !raw.missingFields.every(identifier)||!unique(raw.missingFields))
    throw new Error('R07P_INVALID_STRUCTURED_CANDIDATE');
  return copy(raw) as unknown as R07PSemanticCandidate;
}
/** Keep R07Q offline fixture adapter compatible with the strict parser. */
export function isR07PSemanticCandidate(value:unknown):value is R07PSemanticCandidate{
  try{parseR07PSemanticCandidate(value);return true;}
  catch{return false;}
}
function verifyContext(scope:AuthenticatedScope,context:R07PTrustedContext):void{
  const key=exactScopeKey(scope);
  if(!record(context)||!keys(context,[
    'scopeKey','historyComplete','activeDraft','references',
    ...(context.pendingPriceFollowup===undefined?[]:['pendingPriceFollowup']),
    ...(context.pendingLineFollowup===undefined?[]:['pendingLineFollowup']),
    ...(context.dialogueHistory===undefined?[]:['dialogueHistory']),
  ])||context.scopeKey!==key||typeof context.historyComplete!=='boolean'||
    !Array.isArray(context.references)||context.references.length>200||
    !context.references.every(ref=>record(ref)&&keys(ref,[
      'kind','id','documentKind','scopeKey',
    ])&&referenceKinds.includes(ref.kind as RefKind)&&identifier(ref.id)&&
      ref.scopeKey===key&&['quotation','invoice','other',null].includes(
        ref.documentKind as string|null))||
    !unique(context.references.map(x=>x.kind+':'+x.id)))
    throw new Error('R07P_UNTRUSTED_CONTEXT_SCOPE');
  const draft=context.activeDraft;
  if(draft!==null&&(!record(draft)||!keys(draft,[
    'id','kind','revision','lineIds',
    ...(draft.namedLines===undefined?[]:['namedLines']),
  ])||!identifier(draft.id)||draft.kind!=='quotation'||
    !Number.isSafeInteger(draft.revision)||draft.revision<1||
    !Array.isArray(draft.lineIds)||draft.lineIds.length>120||
    !draft.lineIds.every(identifier)||!unique(draft.lineIds)))
    throw new Error('R07P_UNTRUSTED_DRAFT_CONTEXT');
  if(draft&&draft.namedLines!==undefined&&
    (!Array.isArray(draft.namedLines)||
      draft.namedLines.length!==draft.lineIds.length||
      !draft.namedLines.every((line,i)=>record(line)&&
        keys(line,['lineId','description'])&&
        line.lineId===draft.lineIds[i]&&
        typeof line.description==='string'&&
        line.description.length>0&&line.description.length<=3000&&
        !/[\u0000-\u001f\u007f]/u.test(line.description))))
    throw new Error('R07P_UNTRUSTED_NAMED_DRAFT_LINES');
  if(context.dialogueHistory!==undefined&&
    (!context.historyComplete||!Array.isArray(context.dialogueHistory)||
      context.dialogueHistory.length>8||
      context.dialogueHistory.length%2!==0||
      !context.dialogueHistory.every((m,i)=>record(m)&&
        keys(m,['role','text'])&&
        m.role===(i%2?'assistant':'user')&&
        text(m.text,320))))
    throw new Error('R07P_UNTRUSTED_DIALOGUE_HISTORY');
  const pending=context.pendingPriceFollowup;
  if(pending!==undefined&&(!record(pending)||!keys(pending,[
    'currentUserMessageId','currentIdempotencyKey',
    'previousTurnId','draftId','draftRevision','field',
  ])||!identifier(pending.currentUserMessageId)||
    !identifier(pending.currentIdempotencyKey)||
    !identifier(pending.previousTurnId)||!identifier(pending.draftId)||
    !Number.isSafeInteger(pending.draftRevision)||pending.draftRevision<1||
    pending.field!=='selling_unit_price'||
    !draft||draft.id!==pending.draftId||
    draft.revision!==pending.draftRevision||draft.lineIds.length!==1))
    throw new Error('R07P_UNTRUSTED_PRICE_FOLLOWUP');
  const linePending=context.pendingLineFollowup;
  if(linePending!==undefined&&(!record(linePending)||!keys(linePending,[
    'currentUserMessageId','currentIdempotencyKey',
    'previousTurnId','draftId','draftRevision','field','value','lineId',
  ])||!identifier(linePending.currentUserMessageId)||
    !identifier(linePending.currentIdempotencyKey)||
    !identifier(linePending.previousTurnId)||
    !identifier(linePending.draftId)||!identifier(linePending.lineId)||
    !Number.isSafeInteger(linePending.draftRevision)||
    linePending.draftRevision<1||linePending.field!=='quantity'||
    typeof linePending.value!=='string'||
    !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u.test(linePending.value)||
    Number(linePending.value)<=0||!draft||
    draft.id!==linePending.draftId||
    draft.revision!==linePending.draftRevision||
    draft.lineIds.length<2||!draft.lineIds.includes(linePending.lineId)))
    throw new Error('R07P_UNTRUSTED_LINE_FOLLOWUP');
}
function build(scope:AuthenticatedScope,turnId:string,action:Action,
  subject:GroundedIntent['subjectRef'],facts:Fact[],sources:string[],
  missing:string[],unresolved:GroundedIntent['unresolvedReferences']):GroundedIntent{
  const i:GroundedIntent={
    schemaVersion:1,scope:copy(scope),intentId:'r07p-'+turnId,turnId,
    action,subjectRef:subject,sourcePolicy:sources.length?'uploaded_only':'none',
    referencedSourceIds:sources,
    argumentFacts:facts.map(x=>({
      name:x.name,value:x.value,provenanceStatus:'uncertain',
      evidenceRefs:[],originalText:x.value,
    })),
    unresolvedReferences:unresolved,missingFields:[...new Set(missing)],
    contradictoryFields:[],executable:false,confidence:0,
  };
  assertCoreContract('GroundedIntent',i);
  return i;
}
function policy(action:Action):R07PPlan['risk']{
  return action==='request_approval'||action==='execute_approved'?'approval':
    ['prepare_quote','edit_draft','cancel'].includes(action)?'preparation':
    ['read_file','read_business','preview_draft','analyze','discuss'].includes(
      action)?'read_only':'blocked';
}
const writeLike=(action:Action)=>['prepare_quote','edit_draft','cancel',
  'request_approval','execute_approved'].includes(action);
const envelope=(input:R07LocalTurnInput):R07RequestEnvelope=>({
  schemaVersion:1,accountId:input.accountId,companyId:input.companyId,
  branchId:input.branchId,threadId:input.threadId,scopeType:input.scopeType,
});
export class R07PSemanticPlanner{
  constructor(private readonly deps:{
    principal:R07AuthenticatedPrincipalVerifier;
    membership:R07ServerMembershipStore;
    context:R07PContextReader;
    /** Explicitly test-only. Real providers belong to R07Q. */
    syntheticInterpreter?:R07PSyntheticInterpreter;
    allowSyntheticInference?:boolean;
    /** Explicit server-only opt-in, no browser flags or production activation. */
    allowDeterministicStructuredIntents?:boolean;
    /** Server-only R07Q model routing, never enabled by request flags. */
    routedInterpreter?:R07PRoutedInterpreter;
    allowRoutedInference?:boolean;
    clock?:()=>Date;
  }){}
  async plan(token:string,raw:unknown):Promise<R07PPlan>{
    validateRequest(raw);
    const input=raw as R07LocalTurnInput;
    const scope=await authorizeR07ScopedRequest({
      bearerToken:token,body:envelope(input),principal:this.deps.principal,
      membership:this.deps.membership,
      serverNowEpochSeconds:Math.floor((this.deps.clock?.()??new Date()).getTime()/1000),
    });
    // Fast-path local greetings and draft-start BEFORE loading the full
    // audited history. Authorization still runs first.
    const local=recognizeR05LocalIntent(input.message,0);
    const language=languageOf(input.message);
    const turnId='proposal-'+input.userMessageId;
    const allowWrite=scope.scopeType==='business'&&scope.role!=='viewer'&&
      input.mode==='controller';
    if(local){
      const action:Action=local.kind==='greeting'?'discuss':'prepare_quote';
      const denied=action==='prepare_quote'&&!allowWrite;
      return {
        status:denied?'needs_clarification':local.kind==='greeting'?
          'local_reply':'proposed',
        interpretation:'deterministic',language,
        intent:build(scope,turnId,denied?'clarify':action,null,[],[],
          denied?['controller_permission']:[],[]),
        risk:denied?'blocked':policy(action),providerCalls:0,
        financialSaved:false,
        assistantReply:denied?
          'إنشاء المسودة يتطلب صلاحية إعداد مسودات معتمدة من الخادم.':
          local.kind==='greeting'?local.reply:null,
      };
    }
    // Never let an injected/real model silently discard a second command
    // (such as "change quantity AND issue invoice"). Only an exact bounded
    // one-line patch is locally supported; multi-target edits are blocked.
    // Authentication already succeeded above. No financial provider, context
    // or draft write is used to reject an unsupported compound.
    if(this.deps.allowDeterministicStructuredIntents===true&&
      requiresR07PCompoundClarification(input.message)){
      return {status:'needs_clarification',interpretation:'deterministic',
        language,
        intent:build(scope,turnId,'clarify',null,[],[],
          ['unsupported_compound_request'],[]),
        risk:'blocked',providerCalls:0,financialSaved:false,
        assistantReply:'الطلب يتضمن خطوات أو حقولاً متعددة تحتاج مراجعة. '+
          'حدد عملية واحدة آمنة في كل مرة؛ لم يُنفّذ أي تعديل.'};
    }
    const routed=Boolean(this.deps.allowRoutedInference&&this.deps.routedInterpreter);
    const synthetic=Boolean(this.deps.allowSyntheticInference&&
      this.deps.syntheticInterpreter);
    if(routed&&synthetic)throw new Error('R07P_CONFLICTING_INFERENCE_CONFIG');
    const localStructured=this.deps.allowDeterministicStructuredIntents===true;
    const deterministic=localStructured?
      recognizeR07PLocalStructuredIntent(input.message):null;
    const standalonePrice=localStructured&&!deterministic?
      parseR07PStandalonePriceReply(input.message):null;
    const standaloneLine=localStructured&&!deterministic&&
      standalonePrice===null?parseR07PStandaloneLineReply(input.message):null;
    const standaloneName=localStructured&&!deterministic&&
      standalonePrice===null&&standaloneLine===null?
      parseR07PNamedLineReply(input.message):null;
    const hasLineSelection=standaloneLine!==null||standaloneName!==null;
    if(!routed&&!synthetic&&!deterministic&&standalonePrice===null&&
      !hasLineSelection){
      return {status:'unsupported',interpretation:'unavailable',language,
        intent:build(scope,turnId,'clarify',null,[],[],['semantic_provider_unavailable'],[]),
        risk:'blocked',providerCalls:0,financialSaved:false,
        assistantReply:'يتطلب هذا الطلب فهمًا دلاليًا لم يتم تفعيله بعد.'};
    }
    const context=await this.deps.context.load(scope,
      standalonePrice!==null||hasLineSelection||routed?{
        userMessageId:input.userMessageId,
        idempotencyKey:input.idempotencyKey,message:input.message,
      }:undefined);
    verifyContext(scope,context);
    const pending=context.pendingPriceFollowup;
    const verifiedFollowup=standalonePrice!==null&&pending!==undefined&&
      pending.currentUserMessageId===input.userMessageId&&
      pending.currentIdempotencyKey===input.idempotencyKey&&
      context.activeDraft?.id===pending.draftId&&
      context.activeDraft.revision===pending.draftRevision&&
      context.activeDraft.lineIds.length===1;
    // Standalone numbers must NEVER be interpreted as actions by a model,
    // even when no trusted prior request is available.
    if(standalonePrice!==null&&!verifiedFollowup){
      return {status:'needs_clarification',interpretation:'deterministic',language,
        intent:build(scope,turnId,'clarify',null,[],[],
          ['verified_previous_price_request'],[]),
        risk:'blocked',providerCalls:0,financialSaved:false,
        assistantReply:'لا يوجد طلب سعر معلّق وموثوق يمكن إكماله. اكتب طلب التعديل كاملاً.'};
    }
    const linePending=context.pendingLineFollowup;
    const verifiedLine=hasLineSelection&&linePending!==undefined&&
      linePending.currentUserMessageId===input.userMessageId&&
      linePending.currentIdempotencyKey===input.idempotencyKey&&
      context.activeDraft?.id===linePending.draftId&&
      context.activeDraft.revision===linePending.draftRevision&&
      context.activeDraft.lineIds.length>=2&&
      (standaloneLine!==null?
        context.activeDraft.lineIds.length===2&&
          context.activeDraft.lineIds[standaloneLine]===linePending.lineId:
        context.activeDraft.lineIds.includes(linePending.lineId));
    // No trusted preceding question: an ordinal is not an operation.
    // Never give a model the opportunity to invent a line identifier.
    if(hasLineSelection&&!verifiedLine){
      return {status:'needs_clarification',interpretation:'deterministic',language,
        intent:build(scope,turnId,'clarify',null,[],[],
          ['verified_previous_line_request'],[]),
        risk:'blocked',providerCalls:0,financialSaved:false,
        assistantReply:'لا يوجد طلب تعديل صنف معلّق وموثوق. اذكر التعديل والصنف صراحة.'};
    }
    const resumed=verifiedFollowup?{
      action:'edit_draft' as const,subject:null,reference:'active_draft' as const,
      facts:[{name:'selling_unit_price',value:standalonePrice!}],
      sourceIds:[],missingFields:[],
    }:null;
    const lineResumed=verifiedLine?{
      action:'edit_draft' as const,subject:null,reference:'active_draft' as const,
      facts:[{name:'quantity',value:linePending!.value},
        {name:'line_id',value:linePending!.lineId}],
      sourceIds:[],missingFields:[],
    }:null;
    const references=context.references.map(r=>({kind:r.kind,id:r.id}));
    let rawCandidate:unknown,providerCalls:number,
      interpretation:'deterministic'|'synthetic_model'|'routed_model';
    if(deterministic||resumed||lineResumed){
      rawCandidate=deterministic??resumed??lineResumed;
      providerCalls=0;
      interpretation='deterministic';
    }else if(routed){
      const outcome=await this.deps.routedInterpreter!.interpret({
        scope,message:input.message,language,mode:input.mode,
        knownReferences:references,
        history:context.dialogueHistory??[],
      });
      if(!outcome||!Number.isSafeInteger(outcome.calls)||
        outcome.calls<0||outcome.calls>3)
        throw new Error('R07P_INVALID_ROUTED_RECEIPT');
      providerCalls=outcome.calls;
      if(!outcome.ok){
        return {status:'unsupported',interpretation:'unavailable',language,
          intent:build(scope,turnId,'clarify',null,[],[],
            ['semantic_provider_unavailable'],[]),
          risk:'blocked',providerCalls,financialSaved:false,
          assistantReply:'تعذر تحليل الطلب الآن. لم يتم إجراء أي تغيير.'};
      }
      rawCandidate=outcome.candidate;
      interpretation='routed_model';
    }else{
      rawCandidate=await this.deps.syntheticInterpreter!.interpret({
        message:input.message,language,mode:input.mode,
        knownReferences:references,
      });
      providerCalls=1;
      interpretation='synthetic_model';
    }
    const c=parseR07PSemanticCandidate(rawCandidate);
    const missing=[...c.missingFields];
    // A name from text is only a *hint*. Only a locally parsed explicit
    // command may use the server-verified current R07D draft line list.
    // Never pass the unverified name as an editor fact or let the model
    // synthesize a database line ID from it.
    const lineNames=c.facts.filter(x=>x.name==='line_name');
    const resolvedFacts=c.facts.filter(x=>x.name!=='line_name');
    if(lineNames.length){
      const eligible=interpretation==='deterministic'&&
        c.action==='edit_draft'&&lineNames.length===1&&
        !c.facts.some(x=>x.name==='line_id')&&
        c.facts.some(x=>['quantity','selling_unit_price'].includes(x.name));
      const id=eligible&&context.activeDraft?.namedLines?
        resolveR07PNamedLineId(lineNames[0]!.value,
          context.activeDraft.namedLines):null;
      if(!id)missing.push('unique_verified_line_name');
      else resolvedFacts.push({name:'line_id',value:id});
    }
    const unresolved:GroundedIntent['unresolvedReferences']=[];
    let subject:GroundedIntent['subjectRef']=null;
    const addUnknown=(expression:string,reason:string,candidateIds:string[]=[])=>{
      unresolved.push({expression,candidateIds,reason});
    };
    if(writeLike(c.action)&&!allowWrite){
      missing.push('controller_permission');
    }
    if(c.subject){
      const found=context.references.find(r=>r.kind===c.subject!.kind&&
        r.id===c.subject!.id);
      if(found||c.subject.kind==='draft'&&
        c.subject.id===context.activeDraft?.id){
        subject=copy(c.subject);
      }else{
        addUnknown(c.subject.id,'unverified_or_foreign_reference');
      }
    }else if(c.reference==='active_draft'||c.action==='edit_draft'){
      if(!context.historyComplete){
        addUnknown('active_draft','incomplete_history');
      }else if(context.activeDraft){
        subject={kind:'draft',id:context.activeDraft.id};
      }else{
        const drafts=context.references.filter(r=>r.kind==='draft');
        addUnknown('active_draft',
          drafts.length>1?'ambiguous_active_draft':'no_verified_active_draft',
          drafts.map(r=>r.id));
      }
    }else if(c.reference==='last_quotation'||c.reference==='last_document'){
      if(!context.historyComplete){
        addUnknown(c.reference,'incomplete_history');
      }else{
        // A model may ask for "last"; ordering is not independently proved
        // by this bounded reference set. Multiple candidates are ambiguous.
        const candidates=context.references.filter(r=>r.kind==='document'&&
          (c.reference==='last_document'||r.documentKind==='quotation'));
        if(candidates.length===1)subject={kind:'document',id:candidates[0]!.id};
        else addUnknown(c.reference,'ambiguous_or_missing_document',
          candidates.map(r=>r.id));
      }
    }
    if(c.action==='edit_draft'){
      if(subject?.kind!=='draft')missing.push('verified_draft');
      // Adding a NEW line must not be interpreted as editing one of the
      // existing lines. R07R still requires complete validated line data.
      if(resolvedFacts.find(f=>f.name==='operation')?.value!=='append_line'&&
        resolvedFacts.some(f=>['quantity','unit','selling_unit_price'].includes(f.name))){
        const line=resolvedFacts.find(f=>f.name==='line_id')?.value;
        const lines=context.activeDraft?.lineIds??[];
        if(!line&&lines.length!==1)
          addUnknown('line_item','ambiguous_or_missing_line',lines);
        else if(line&&!lines.includes(line))
          addUnknown(line,'unverified_line_reference');
      }
    }
    if(c.action==='read_file'&&!c.sourceIds.length)missing.push('verified_source');
    // Source IDs must exist in this verified scoped context. Never use an
    // ID just because the model emitted one.
    const sources:string[]=[];
    for(const id of c.sourceIds){
      if(context.references.some(x=>x.kind==='document'&&x.id===id))
        sources.push(id);
      else addUnknown(id,'source_not_verified_in_scope');
    }
    // Raw extracted values are only claims made by the user/model.
    // They never become a canonical customer, product, amount or permission.
    const needsHelp=missing.length>0||unresolved.length>0||
      c.action==='clarify'||c.action==='execute_approved'||
      c.action==='request_approval';
    const action:Action=needsHelp?'clarify':c.action;
    const intent=build(scope,turnId,action,subject,resolvedFacts,sources,
      missing,unresolved);
    return {
      status:['execute_approved','request_approval'].includes(c.action)?
        'approval_required':needsHelp?'needs_clarification':'proposed',
      interpretation,language,intent,
      risk:needsHelp?'blocked':policy(c.action),providerCalls,
      financialSaved:false,
      assistantReply:needsHelp?
        'يلزم توضيح المرجع أو الصلاحية قبل متابعة هذا الطلب.':null,
    };
  }
}
