/**
 * R07Q — inactive semantic output bridge using the ONE existing R05 router.
 * Only synthetic fixtures and injected offline transports; never customer data.
 * No provider SDK, network endpoint, credential or financial writer exists here.
 */
import type {AuthenticatedScope} from '../domain/contracts.js';
import {validateAuthenticatedScope} from '../domain/validation.js';
import type {R05RequestNeeds,TrustedModelRecord} from './eligibility.js';
import {routeR05,type R05Outcome,type R05Transport,
  type R05HealthBook} from './gateway.js';
import {isR07PSemanticCandidate,type R07PSemanticCandidate}
  from './semantic-planner.js';

export const R07Q_SEMANTIC_BRIDGE_ACTIVE=false as const;
export interface R07QOfflineFixtureTransport extends R05Transport {
  readonly transportKind:'offline_synthetic_fixture';
}
export interface R07QOfflineInput{
  /** Server-verified scope — never constructed from model output. */
  scope:AuthenticatedScope;
  needs:R05RequestNeeds;
  /** Trusted registry, NOT client-supplied catalog claims. */
  models:readonly TrustedModelRecord[];
  fixture:{testOnly:true;fixtureId:string;utterance:string};
  transport:R07QOfflineFixtureTransport;
  signal?:AbortSignal;
  now?:()=>number;
  health?:R05HealthBook;
}
const isFixture=(x:unknown):x is R07QOfflineInput['fixture']=>{
  if(!x||typeof x!=='object'||Array.isArray(x)||
    Object.getPrototypeOf(x)!==Object.prototype)return false;
  const o=x as Record<string,unknown>,keys=Object.keys(o).sort();
  return keys.join(',')==='fixtureId,testOnly,utterance'&&o.testOnly===true&&
    typeof o.fixtureId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(o.fixtureId)&&
    typeof o.utterance==='string'&&o.utterance.length>0&&o.utterance.length<=6000;
};
const unavailable=():R05Outcome<R07PSemanticCandidate>=>({
  ok:false,code:'R05_NO_ELIGIBLE_MODELS',attempts:0,observations:[],
});
export async function routeR07QOfflineSemantic(
  input:R07QOfflineInput,
):Promise<R05Outcome<R07PSemanticCandidate>>{
  if(!validateAuthenticatedScope(input.scope)||!input.transport||
    input.transport.transportKind!=='offline_synthetic_fixture')
    throw Error('R07Q_UNTRUSTED_OR_LIVE_TRANSPORT');
  if(input.needs?.requiredOutputSchema!=='json_v1'||
    input.needs.privacyClass!=='public_synthetic'||!isFixture(input.fixture))
    throw Error('R07Q_PRIVATE_OR_INVALID_FIXTURE');
  if(!Array.isArray(input.models)||input.models.length>1000)
    throw Error('R07Q_INVALID_TRUSTED_MODEL_POOL');
  // The local paths never dispatch model inference, even in the sandbox.
  if(['local_greeting','local_draft_start','unsupported'].includes(input.needs.taskType))
    return unavailable();
  return routeR05<R07PSemanticCandidate>({
    scope:input.scope,needs:input.needs,models:input.models,
    payload:input.fixture,transport:input.transport,
    validate:isR07PSemanticCandidate,
    signal:input.signal,now:input.now,health:input.health,
  });
}
