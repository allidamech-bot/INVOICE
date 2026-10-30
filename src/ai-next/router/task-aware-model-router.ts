/**
 * R07Q — inactive provider-policy boundary for structured semantic planning.
 *
 * No network clients or credentials here. Only an explicitly injected offline
 * fixture transport can be called. Production provider adapters and release
 * authority are separate, currently BLOCKED responsibilities.
 */
import type {AuthenticatedScope} from '../domain/contracts.js';
import {validateAuthenticatedScope} from '../domain/validation.js';
import {isR07PSemanticCandidate,type R07PSemanticCandidate}
  from './semantic-planner.js';
import {R05HealthBook,routeR05,
  type R05Transport,type R05Outcome} from './gateway.js';
import type {R05RequestNeeds,TrustedModelRecord} from './eligibility.js';

export const R07Q_PROVIDER_ROUTING_ACTIVE=false as const;

/** Runtime guard for this pre-release adapter; NOT a live provider permission. */
export type R07QFixtureTransport=R05Transport&{
  readonly transportKind:'offline_synthetic_fixture';
};

export interface R07QRequest{
  scope:AuthenticatedScope;
  needs:R05RequestNeeds;
  /** Server-owned registry metadata, never browser or model supplied. */
  models:readonly TrustedModelRecord[];
  /** Synthetic input only; real customer documents are prohibited. */
  payload:unknown;
  transport:R07QFixtureTransport;
  signal?:AbortSignal;
  now?:()=>number;
  health?:R05HealthBook;
}

const qualityPrior={basic:0,capable:10,advanced:20} as const;
const taskPreference=(task:R05RequestNeeds['taskType'])=>{
  if(['general_conversation','draft_modification','quotation_preparation',
    'business_read'].includes(task))
    return {basic:70,capable:45,advanced:20};
  if(['financial_analysis','document_comparison','long_context_reasoning'].includes(task))
    return {basic:0,capable:40,advanced:65};
  return {basic:20,capable:65,advanced:45};
};

/** A model's observed reliability still influences routing within its tier. */
export function rankR07QTaskModel(
  model:TrustedModelRecord,health:R05HealthBook,task:R05RequestNeeds['taskType'],
):number{
  const preferred=taskPreference(task);
  // Remove R05's generic quality prior before applying task preference.
  // The remaining score represents bounded observed health/latency.
  return preferred[model.qualityTier]+health.score(model)-qualityPrior[model.qualityTier];
}

const noModels=():R05Outcome<R07PSemanticCandidate>=>({
  ok:false,code:'R05_NO_ELIGIBLE_MODELS',attempts:0,observations:[],
});

export async function routeR07QOffline(
  input:R07QRequest,
):Promise<R05Outcome<R07PSemanticCandidate>>{
  if(!validateAuthenticatedScope(input.scope)||
    !input.transport||input.transport.transportKind!=='offline_synthetic_fixture')
    throw Error('R07Q_OFFLINE_AUTHORIZATION_REQUIRED');
  if(!input.needs||input.needs.requiredOutputSchema!=='json_v1'||
    input.needs.privacyClass!=='public_synthetic')
    throw Error('R07Q_PRIVATE_OR_NONSTRUCTURED_INPUT_DENIED');
  if(!Array.isArray(input.models)||input.models.length>300)
    throw Error('R07Q_MODEL_POOL_BOUND_EXCEEDED');
  // All actual provider calls are blocked: there is no deployed endpoint,
  // transport registry, network dependency or production activation path.
  // Local deterministic commands must never fall through to inference.
  if(['local_greeting','local_draft_start','unsupported'].includes(input.needs.taskType))
    return noModels();
  return routeR05<R07PSemanticCandidate>({
    scope:input.scope,needs:input.needs,models:input.models,
    payload:input.payload,transport:input.transport,
    validate:isR07PSemanticCandidate,
    signal:input.signal,now:input.now,health:input.health,
    rankModel:(model,health)=>rankR07QTaskModel(model,health,input.needs.taskType),
  });
}
