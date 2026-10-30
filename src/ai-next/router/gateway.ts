/**
 * R05 sandbox gateway. Provider calls are ONLY possible through injected
 * server-owned transports. This file has no network, secrets or finance imports.
 */
import type {AuthenticatedScope,ModelEligibility} from '../domain/contracts.js';
import {
  assessR05Model, eligibleR05Pool,
  type R05RequestNeeds,type TrustedModelRecord,
} from './eligibility.js';

export type R05FailureKind='timeout'|'cancelled'|'rate_limit'|'network'|
  'upstream'|'invalid_result'|'unsupported'|'unavailable'|
  'authentication'|'quota_exhausted'|'region_denied'|'privacy_denied';
export class R05ProviderFailure extends Error {
  constructor(
    readonly kind:R05FailureKind,
    readonly quotaScope:'model'|'provider'='provider',
    readonly retryAfterMs:number|null=null,
  ){super('R05_'+kind.toUpperCase());}
}
export interface R05Transport {
  invoke(input:{
    model:TrustedModelRecord;
    payload:unknown;
    signal:AbortSignal;
    deadlineMs:number;
  }):Promise<unknown>;
}
export interface R05Diagnostic {
  providerId:string;modelId:string;category:R05FailureKind|'ok';latencyMs:number;
}
export type R05Outcome<T> =
  | {ok:true;data:T;providerId:string;modelId:string;attempts:number;fallbackUsed:boolean;
      observations:R05Diagnostic[]}
  | {ok:false;code:'R05_NO_ELIGIBLE_MODELS'|'R05_CANCELLED'|'R05_DEADLINE'|
      'R05_PROVIDER_UNAVAILABLE'|'R05_INVALID_RESULT'|'R05_PRIVACY_DENIED';
      attempts:number;observations:R05Diagnostic[]};

type Sample={time:number;valid:boolean;latencyMs:number};
type State={failures:number;openUntil:number;probing:boolean;samples:Sample[];updatedAt:number};
const MAX_HEALTH_ENTRIES=128,HEALTH_TTL_MS=300_000,CIRCUIT_MS=30_000;
const MIN_OBSERVATIONS=3,MAX_ATTEMPTS=3,MAX_DEADLINE_MS=50_000;
const key=(model:TrustedModelRecord)=>model.providerId+':'+model.modelId;

export class R05HealthBook {
  private states=new Map<string,State>();
  private providerQuota=new Map<string,number>();
  private modelQuota=new Map<string,number>();
  constructor(private readonly now:()=>number=()=>Date.now()){}
  private prune():void{
    const now=this.now();
    for(const [id,s] of this.states)
      if(now-s.updatedAt>HEALTH_TTL_MS&&s.openUntil<=now)this.states.delete(id);
    for(const [id,until] of this.providerQuota)if(until<=now)this.providerQuota.delete(id);
    for(const [id,until] of this.modelQuota)if(until<=now)this.modelQuota.delete(id);
    while(this.states.size>MAX_HEALTH_ENTRIES)
      this.states.delete(this.states.keys().next().value!);
  }
  available(model:TrustedModelRecord):boolean {
    this.prune();
    const now=this.now(),s=this.states.get(key(model));
    return (this.providerQuota.get(model.providerId)||0)<=now &&
      (this.modelQuota.get(key(model))||0)<=now &&
      (!s || (s.openUntil<=now&&!s.probing));
  }
  reserve(model:TrustedModelRecord):boolean{
    if(!this.available(model))return false;
    const state=this.states.get(key(model));
    if(state&&state.openUntil>0){
      // After the open interval, admit one bounded half-open trial only.
      state.probing=true;
    }
    return true;
  }
  observe(model:TrustedModelRecord,valid:boolean,latencyMs:number,
    error?:R05ProviderFailure):void {
    const now=this.now(),k=key(model);
    const s=this.states.get(k)||{
      failures:0,openUntil:0,probing:false,samples:[] as Sample[],updatedAt:now,
    };
    s.probing=false;
    s.failures=valid?0:Math.min(10,s.failures+1);
    s.updatedAt=now;
    s.samples.push({time:now,valid,latencyMs:Math.max(0,Math.min(latencyMs,MAX_DEADLINE_MS))});
    if(s.samples.length>20)s.samples.shift();
    if(valid)s.openUntil=0;
    else if(s.failures>=2||s.openUntil>0)s.openUntil=now+CIRCUIT_MS;
    if(error?.kind==='rate_limit'||error?.kind==='quota_exhausted'){
      const defaultMs=error.kind==='quota_exhausted'?1_800_000:60_000;
      const duration=Math.max(30_000,Math.min(86_400_000,error.retryAfterMs??defaultMs));
      const map=error.quotaScope==='provider'?this.providerQuota:this.modelQuota;
      const quotaKey=error.quotaScope==='provider'?model.providerId:k;
      map.set(quotaKey,now+duration);
    }
    if(error?.kind==='authentication'||error?.kind==='region_denied'||
      error?.kind==='privacy_denied')
      this.providerQuota.set(model.providerId,now+300_000);
    if(error?.kind==='unsupported')this.modelQuota.set(k,now+300_000);
    this.states.delete(k);this.states.set(k,s);this.prune();
  }
  score(model:TrustedModelRecord):number{
    const s=this.states.get(key(model));
    const prior={basic:0,capable:10,advanced:20}[model.qualityTier];
    if(!s||s.samples.length<MIN_OBSERVATIONS||
      this.now()-s.updatedAt>HEALTH_TTL_MS)return prior;
    const successful=s.samples.filter(x=>x.valid);
    const validity=successful.length/s.samples.length;
    const latencies=successful.map(x=>x.latencyMs).sort((a,b)=>a-b);
    const p95=latencies[Math.max(0,Math.ceil(latencies.length*0.95)-1)]??MAX_DEADLINE_MS;
    return prior+validity*30-Math.min(20,p95/1500);
  }
}
/**
 * Non-authoritative task fit: only changes ordering among independently
 * verified eligible zero-price candidates. Never grants model eligibility.
 * Fast/simple requests prefer capable low-latency candidates; complex
 * reasoning prefers verified strong capability priors.
 */
export function R05TaskPreference(needs:R05RequestNeeds,
  model:TrustedModelRecord):number{
  const tier=model.qualityTier;
  if(['clarification','general_conversation','business_read'].includes(needs.taskType))
    return {basic:32,capable:26,advanced:3}[tier];
  if(['financial_analysis','long_context_reasoning','document_comparison',
    'structured_extraction'].includes(needs.taskType))
    return {basic:0,capable:18,advanced:34}[tier];
  return {basic:10,capable:18,advanced:19}[tier];
}
export async function routeR05<T>(input:{
  scope:AuthenticatedScope;
  needs:R05RequestNeeds;
  models:readonly TrustedModelRecord[];
  payload:unknown;
  transport:R05Transport;
  validate:(value:unknown)=>value is T;
  signal?:AbortSignal;
  now?:()=>number;
  health?:R05HealthBook;
}):Promise<R05Outcome<T>>{
  const now=input.now??(()=>Date.now()),start=now();
  const deadline=Math.min(MAX_DEADLINE_MS,Math.max(0,Math.floor(input.needs.deadlineMs)));
  const health=input.health??new R05HealthBook(now);
  // No provider is called for deterministic classes; callers must use runR05Local.
  if(['local_greeting','local_draft_start','unsupported'].includes(input.needs.taskType))
    return {ok:false,code:'R05_NO_ELIGIBLE_MODELS',attempts:0,observations:[]};
  if(input.signal?.aborted)
    return {ok:false,code:'R05_CANCELLED',attempts:0,observations:[]};
  const assessed=eligibleR05Pool({
    scope:input.scope,now:new Date().toISOString(),models:input.models,
    needs:{...input.needs,deadlineMs:deadline},
  });
  const candidates=assessed.filter(x=>x.assessment.eligible)
    .sort((a,b)=>(health.score(b.record)+R05TaskPreference(input.needs,b.record))-
      (health.score(a.record)+R05TaskPreference(input.needs,a.record)));
  const observations:R05Diagnostic[]=[];
  if(!candidates.length)
    return {ok:false,code:'R05_NO_ELIGIBLE_MODELS',attempts:0,observations};
  let invalid=false,attempts=0;
  for(const item of candidates){
    if(attempts>=MAX_ATTEMPTS)break;
    if(input.signal?.aborted)
      return {ok:false,code:'R05_CANCELLED',attempts,observations};
    if(!health.reserve(item.record))continue;
    const remaining=deadline-(now()-start);
    if(remaining<1000)
      return {ok:false,code:'R05_DEADLINE',attempts,observations};
    attempts+=1;
    // Never add per-model deadlines together beyond the end-to-end deadline.
    const perAttempt=Math.min(12_000,remaining);
    const started=now(),controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    let abortListener:(()=>void)|undefined;
    const canceled=new Promise<never>((_,reject)=>{
      abortListener=()=>{controller.abort();reject(new R05ProviderFailure('cancelled'));};
      input.signal?.addEventListener('abort',abortListener,{once:true});
      if(input.signal?.aborted)abortListener();
      timer=setTimeout(()=>{controller.abort();reject(new R05ProviderFailure('timeout'));},
        perAttempt);
    });
    try{
      const data=await Promise.race([
        input.transport.invoke({
          model:item.record,payload:input.payload,
          signal:controller.signal,deadlineMs:perAttempt,
        }),canceled,
      ]);
      if(!input.validate(data))throw new R05ProviderFailure('invalid_result');
      // A success is only a schema-valid response, never verified business truth.
      health.observe(item.record,true,now()-started);
      observations.push({providerId:item.record.providerId,
        modelId:item.record.modelId,category:'ok',latencyMs:now()-started});
      return {ok:true,data,providerId:item.record.providerId,
        modelId:item.record.modelId,attempts,fallbackUsed:attempts>1,observations};
    }catch(error){
      const failure=error instanceof R05ProviderFailure?error:
        new R05ProviderFailure(input.signal?.aborted?'cancelled':'network');
      health.observe(item.record,false,now()-started,failure);
      observations.push({providerId:item.record.providerId,modelId:item.record.modelId,
        category:failure.kind,latencyMs:now()-started});
      if(failure.kind==='invalid_result')invalid=true;
      // Revoked runtime consent is global: never fall back to another provider.
      if(failure.kind==='privacy_denied')
        return {ok:false,code:'R05_PRIVACY_DENIED',attempts,observations};
      if(failure.kind==='cancelled'||input.signal?.aborted)
        return {ok:false,code:'R05_CANCELLED',attempts,observations};
    }finally{
      if(timer!==undefined)clearTimeout(timer);
      if(abortListener)input.signal?.removeEventListener('abort',abortListener);
      controller.abort();
    }
  }
  return {ok:false,code:deadline-(now()-start)<1000?'R05_DEADLINE':
    invalid?'R05_INVALID_RESULT':'R05_PROVIDER_UNAVAILABLE',attempts,observations};
}
