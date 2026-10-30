/**
 * R07Q-to-R07P typed routing adapter. Disabled; server-side only.
 *
 * No HTTP route, credentials, network client or financial writer. The caller
 * must independently authorize the verified scope and private-data use.
 * Provider transport and verified zero-cost model catalog are injected by
 * a trusted server. All test transports are offline and synthetic.
 */
import type {AuthenticatedScope} from '../domain/contracts.js';
import {validateAuthenticatedScope} from '../domain/validation.js';
import {
  parseR07PSemanticCandidate,
  type R07PSemanticCandidate,type R07PRoutedInterpreter,
} from './semantic-planner.js';
import {routeR05,type R05Transport,type R05HealthBook}
  from './gateway.js';
import type {TrustedModelRecord,R05RequestNeeds} from './eligibility.js';

export const R07Q_ROUTED_SEMANTIC_ACTIVATED=false as const;

type Input=Parameters<R07PRoutedInterpreter['interpret']>[0];
type Outcome=Awaited<ReturnType<R07PRoutedInterpreter['interpret']>>;
const id=(value:unknown):value is string=>typeof value==='string'&&
  value.length>0&&value.length<=160&&!/[\u0000-\u001f\u007f]/u.test(value);
const MODEL_INSTRUCTION=Object.freeze({
  task:'semantic_interpretation_only',
  schema:'r07p_semantic_candidate_v1',
  note:'Return only a strict JSON candidate. Do not claim execution, access permissions, verified business facts, or approval. Use reference handles only. If ambiguous, use missingFields. This output is an untrusted proposal.',
  fields:['action','subject','reference','facts','sourceIds','missingFields'],
});
export class R07QTrustedSemanticGateway implements R07PRoutedInterpreter{
  constructor(private readonly deps:{
    models:()=>Promise<readonly TrustedModelRecord[]>;
    transport:R05Transport;
    /** Separate server-only privacy authorization, never a request-body flag. */
    approveBusinessData:(scope:AuthenticatedScope)=>Promise<boolean>;
    enableRoutedInference?:boolean;
    health?:R05HealthBook;
    clock?:()=>number;
  }){}
  async interpret(input:Input):Promise<Outcome>{
    if(!validateAuthenticatedScope(input.scope)||
      typeof input.message!=='string'||!input.message.trim()||
      input.message.length>6000||
      !['ar','en','mixed','unknown'].includes(input.language)||
      !['advisor','controller'].includes(input.mode)||
      !Array.isArray(input.knownReferences)||
      input.knownReferences.length>200||
      input.knownReferences.some(ref=>!id(ref?.id)||
        !['document','draft','entity'].includes(ref?.kind)))
      throw new Error('R07Q_INVALID_TRUSTED_INPUT');
    // Neither model discovery nor a real transport can be invoked until an
    // independent server authorization explicitly permits private inference.
    if(this.deps.enableRoutedInference!==true||
      input.scope.scopeType!=='business'||
      !await this.deps.approveBusinessData(input.scope))
      return {ok:false,code:'R07Q_PRIVATE_INFERENCE_NOT_AUTHORIZED',calls:0};
    const handleToRef=new Map<string,{kind:'document'|'draft'|'entity';id:string}>();
    const opaqueRefs=input.knownReferences.map((ref,i)=>{
      const handle='ref-'+String(i+1);
      handleToRef.set(handle,{kind:ref.kind,id:ref.id});
      return {kind:ref.kind,handle};
    });
    const decode=(raw:unknown):R07PSemanticCandidate=>{
      const candidate=parseR07PSemanticCandidate(raw);
      let subject=candidate.subject;
      if(subject){
        const resolved=handleToRef.get(subject.id);
        if(!resolved||resolved.kind!==subject.kind)
          throw Error('R07Q_UNVERIFIED_OPAQUE_REFERENCE');
        subject={kind:resolved.kind,id:resolved.id};
      }
      const sources=candidate.sourceIds.map(handle=>{
        const resolved=handleToRef.get(handle);
        if(!resolved||resolved.kind!=='document')
          throw Error('R07Q_UNVERIFIED_OPAQUE_SOURCE');
        return resolved.id;
      });
      if(new Set(sources).size!==sources.length)
        throw Error('R07Q_DUPLICATE_DECODED_SOURCE');
      return {...candidate,subject,sourceIds:sources};
    };
    const estimate=Math.ceil((input.message.length+opaqueRefs.length*40+800)/3);
    const needs:R05RequestNeeds={
      taskType:'general_conversation',inputModalities:['text'],
      inputEstimateTokens:estimate,
      requiredOutputSchema:'json_v1',privacyClass:'internal_business',
      imageCount:0,pageCount:0,deadlineMs:26_000,
    };
    const models=await this.deps.models();
    if(!Array.isArray(models)||models.length>1000)
      throw Error('R07Q_UNTRUSTED_CATALOG_LIMIT');
    const outcome=await routeR05<R07PSemanticCandidate>({
      scope:input.scope,needs,models,
      payload:{
        instruction:MODEL_INSTRUCTION,
        utterance:input.message,
        language:input.language,
        mode:input.mode,
        references:opaqueRefs,
      },
      transport:this.deps.transport,
      validate:(value):value is R07PSemanticCandidate=>{
        try{decode(value);return true;}catch{return false;}
      },
      now:this.deps.clock,
      health:this.deps.health,
    });
    if(!outcome.ok)
      return {ok:false,code:outcome.code,calls:outcome.attempts};
    // Revalidate after the transport to ensure a failed model attempt cannot
    // accidentally supply the candidate from an earlier fallback.
    return {ok:true,candidate:decode(outcome.data),calls:outcome.attempts};
  }
}
