/**
 * R05 LLM suggestions are DATA. Only a trusted server can inject scope,
 * selected evidence, source policy and permissions. Never execute model tools.
 */
import type {AuthenticatedScope,GroundedIntent} from '../domain/contracts.js';
import {assertCoreContract,validateAuthenticatedScope} from '../domain/validation.js';

const safeId=(x:unknown):x is string=>typeof x==='string'&&
  x.length>0&&x.length<=160&&!/[\u0000-\u001f\u007f]/u.test(x);
const record=(x:unknown):x is Record<string,unknown>=>x!==null&&
  typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const allowActions=new Set([
  'discuss','clarify','read_file','read_business','prepare_quote','edit_draft',
  'preview_draft','analyze',
]);
export class R05UntrustedProposal extends Error{
  constructor(public readonly code:string){super(code);}
}
export function validateR05ModelProposal(input:{
  raw:unknown;
  scope:AuthenticatedScope;
  turnId:string;
  intentId:string;
  selectedSourceIds:readonly string[];
  authorizedEvidenceIds:readonly string[];
  currentDraftId:string|null;
  sourcePolicy:'uploaded_only'|'company_only'|'explicit_combination'|'none';
}):GroundedIntent {
  if(!validateAuthenticatedScope(input.scope)||!safeId(input.turnId)||!safeId(input.intentId))
    throw new R05UntrustedProposal('R05_SERVER_AUTH_REQUIRED');
  const raw=input.raw;
  if(!record(raw)||Object.keys(raw).some(k=>!['action','subjectRef','referencedSourceIds','argumentFacts'].includes(k))||
    typeof raw.action!=='string'||!allowActions.has(raw.action))
    throw new R05UntrustedProposal('R05_PROPOSAL_NOT_ALLOWED');
  if(!Array.isArray(raw.referencedSourceIds)||raw.referencedSourceIds.length>100||
    raw.referencedSourceIds.some(x=>!safeId(x)))
    throw new R05UntrustedProposal('R05_INVALID_SOURCE_REFS');
  const refs=raw.referencedSourceIds as string[];
  const selected=new Set(input.selectedSourceIds);
  if(new Set(refs).size!==refs.length||refs.some(x=>!selected.has(x))||
    (refs.length>0&&!['uploaded_only','explicit_combination'].includes(input.sourcePolicy))||
    (raw.action==='read_file'&&refs.length===0))
    throw new R05UntrustedProposal('R05_UNAUTHORIZED_SOURCE');
  let subjectRef:GroundedIntent['subjectRef']=null;
  if(raw.subjectRef!==null){
    if(!record(raw.subjectRef)||Object.keys(raw.subjectRef).sort().join(',')!=='id,kind'||
      !safeId(raw.subjectRef.id))
      throw new R05UntrustedProposal('R05_INVALID_SUBJECT');
    if(raw.subjectRef.kind==='document'&&selected.has(raw.subjectRef.id))
      subjectRef={kind:'document',id:raw.subjectRef.id};
    else if(raw.subjectRef.kind==='draft'&&raw.subjectRef.id===input.currentDraftId)
      subjectRef={kind:'draft',id:raw.subjectRef.id};
    else throw new R05UntrustedProposal('R05_UNAUTHORIZED_SUBJECT');
  }
  if(!Array.isArray(raw.argumentFacts)||raw.argumentFacts.length>100)
    throw new R05UntrustedProposal('R05_INVALID_FACTS');
  const allowedEvidence=new Set(input.authorizedEvidenceIds);
  const facts:GroundedIntent['argumentFacts']=[];
  for(const fact of raw.argumentFacts){
    if(!record(fact)||Object.keys(fact).sort().join(',')!=='evidenceRefs,name,value'||
      !safeId(fact.name)||(fact.value!==null&&
      (typeof fact.value!=='string'||fact.value.length>6000))||
      !Array.isArray(fact.evidenceRefs)||fact.evidenceRefs.length>100||
      fact.evidenceRefs.some(x=>!safeId(x)||!allowedEvidence.has(x)))
      throw new R05UntrustedProposal('R05_UNVERIFIED_EVIDENCE');
    const refs=fact.evidenceRefs as string[];
    if(new Set(refs).size!==refs.length)
      throw new R05UntrustedProposal('R05_DUPLICATE_EVIDENCE');
    facts.push({
      name:fact.name,value:fact.value as string|null,
      provenanceStatus:fact.value===null?'missing':'uncertain',
      evidenceRefs:[...refs],originalText:null,
    });
  }
  const intent:GroundedIntent={
    schemaVersion:1,scope:structuredClone(input.scope),
    turnId:input.turnId,intentId:input.intentId,
    action:raw.action as GroundedIntent['action'],subjectRef,
    sourcePolicy:input.sourcePolicy,referencedSourceIds:[...refs],
    argumentFacts:facts,unresolvedReferences:[],missingFields:[],
    contradictoryFields:[],executable:false,confidence:0,
  };
  assertCoreContract('GroundedIntent',intent);
  return intent;
}
