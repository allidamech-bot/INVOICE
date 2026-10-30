/**
 * R07P semantic interpretation seam. Server-only, inactive, proposal-only.
 * R05 deterministic intents take precedence; no inference or financial writes
 * are included here. R07Q must independently authorize any real provider.
 */
import type {AuthenticatedScope,ConversationMode,GroundedIntent} from '../domain/contracts.js';
import {assertCoreContract} from '../domain/validation.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {recognizeR05LocalIntent} from './local-intents.js';
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
  activeDraft:{id:string;kind:'quotation';revision:number;lineIds:string[]}|null;
  references:R07PTrustedReference[];
}
export interface R07PContextReader{
  /** Must read only server-verified scoped records; never model-derived data. */
  load(scope:AuthenticatedScope):Promise<R07PTrustedContext>;
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
    mode:ConversationMode;knownReferences:{kind:RefKind;id:string}[]}):Promise<unknown>;
}
export type R07PStatus='local_reply'|'proposed'|'needs_clarification'|
  'approval_required'|'unsupported';
export interface R07PPlan{
  status:R07PStatus;
  interpretation:'deterministic'|'synthetic_model'|'unavailable';
  language:'ar'|'en'|'mixed'|'unknown';
  intent:GroundedIntent;
  risk:'read_only'|'preparation'|'approval'|'blocked';
  providerCalls:0|1;
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
function candidateFromUnknown(raw:unknown):R07PSemanticCandidate{
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
function verifyContext(scope:AuthenticatedScope,context:R07PTrustedContext):void{
  const key=exactScopeKey(scope);
  if(!record(context)||!keys(context,[
    'scopeKey','historyComplete','activeDraft','references',
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
  ])||!identifier(draft.id)||draft.kind!=='quotation'||
    !Number.isSafeInteger(draft.revision)||draft.revision<1||
    !Array.isArray(draft.lineIds)||draft.lineIds.length>120||
    !draft.lineIds.every(identifier)||!unique(draft.lineIds)))
    throw new Error('R07P_UNTRUSTED_DRAFT_CONTEXT');
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
    const context=await this.deps.context.load(scope);
    verifyContext(scope,context);
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
    // No real inference is enabled or wired by this package.
    if(!this.deps.allowSyntheticInference||!this.deps.syntheticInterpreter){
      return {status:'unsupported',interpretation:'unavailable',language,
        intent:build(scope,turnId,'clarify',null,[],[],['semantic_provider_unavailable'],[]),
        risk:'blocked',providerCalls:0,financialSaved:false,
        assistantReply:'يتطلب هذا الطلب فهمًا دلاليًا لم يتم تفعيله بعد.'};
    }
    const rawCandidate=await this.deps.syntheticInterpreter.interpret({
      message:input.message,language,mode:input.mode,
      knownReferences:context.references.map(r=>({kind:r.kind,id:r.id})),
    });
    const c=candidateFromUnknown(rawCandidate);
    const missing=[...c.missingFields];
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
        addUnknown('active_draft','no_verified_active_draft');
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
      if(c.facts.some(f=>['quantity','unit','selling_unit_price'].includes(f.name))){
        const line=c.facts.find(f=>f.name==='line_id')?.value;
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
    const intent=build(scope,turnId,action,subject,c.facts,sources,
      missing,unresolved);
    return {
      status:['execute_approved','request_approval'].includes(c.action)?
        'approval_required':needsHelp?'needs_clarification':'proposed',
      interpretation:'synthetic_model',language,intent,
      risk:needsHelp?'blocked':policy(c.action),providerCalls:1,
      financialSaved:false,
      assistantReply:needsHelp?
        'يلزم توضيح المرجع أو الصلاحية قبل متابعة هذا الطلب.':null,
    };
  }
}
