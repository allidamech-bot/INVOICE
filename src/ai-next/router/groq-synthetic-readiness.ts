/**
 * R07V: OFFLINE operator-console evidence preflight.
 *
 * Never calls a model, reads environment keys or authorizes the R05/R07Q
 * runtime. A local JSON input is UNVERIFIED USER CLAIMS. Passing fields
 * may request an independent account/security review, NEVER grant model
 * access or set accountFreeVerified/privacyApproved/modelZeroCostVerified.
 */
export const R07V_GROQ_LIVE_PROBE_ACTIVE=false as const;
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&
  typeof value==='object'&&!Array.isArray(value)&&
  Object.getPrototypeOf(value)===Object.prototype;
const exact=(value:Record<string,unknown>,fields:readonly string[]):boolean=>
  Object.keys(value).sort().join(',')===[...fields].sort().join(',');
const token=(value:unknown):value is string=>
  typeof value==='string'&&/^[a-z0-9][a-z0-9/_.-]{2,127}$/u.test(value);
const strictTime=(value:unknown):value is string=>
  typeof value==='string'&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)&&
  Number.isFinite(Date.parse(value))&&
  new Date(value).toISOString()===value.replace(/Z$/u,'.000Z');
const integer=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=1_000_000;
const yes=(value:unknown):value is 'confirmed'|'not_confirmed'|'unknown'=>
  value==='confirmed'||value==='not_confirmed'||value==='unknown';

export interface R07VGroqOperatorEvidence {
  schemaVersion:1;
  kind:'r07v_groq_operator_console_v1';
  provider:'groq';
  /** Not a token, organization ID or proof that the account is free. */
  observedAt:string;
  plan:'free'|'developer'|'unknown';
  modelId:string;
  organizationZdr:'enabled'|'disabled'|'unknown';
  optionalRetentionFeatures:'disabled'|'enabled'|'unknown';
  modelListed: 'confirmed'|'not_confirmed'|'unknown';
  modelAvailableOnFreePlan:'confirmed'|'not_confirmed'|'unknown';
  jsonSchemaSupport:'confirmed'|'not_confirmed'|'unknown';
  rpm:number;
  rpd:number;
  tpm:number;
  explicitNoBillableUsage:'confirmed'|'not_confirmed'|'unknown';
  /** Guard against using any current LOUREX customer information. */
  syntheticOnly:true;
  /** Local operator review is NOT an independent attestation. */
  evidenceType:'self_reported_unverified';
}
export type R07VReason=
  | 'STALE_CONSOLE_REVIEW'
  | 'FREE_PLAN_UNCONFIRMED'
  | 'MODEL_UNAVAILABLE_OR_NOT_FREE'
  | 'MODEL_JSON_SCHEMA_UNCONFIRMED'
  | 'ORG_RATE_LIMIT_UNCONFIRMED'
  | 'ZERO_BILLING_UNCONFIRMED'
  | 'ZDR_NOT_ENABLED'
  | 'RETENTION_FEATURES_UNCONFIRMED';
export interface R07VGroqReadiness{
  status:'blocked'|'pending_independent_account_review';
  reasons:R07VReason[];
  provider:'groq';
  modelId:string;
  syntheticTestOnly:true;
  suggestedMaxRequests:2;
  /** No self-reported field authorizes an API invocation. */
  accountIdentityVerified:false;
  accountFreeVerified:false;
  perModelPriceVerified:false;
  privacyApprovalVerified:false;
  canInvokeProvider:false;
  canAccessRealBusinessData:false;
  canChangeProduction:false;
}
export function assessR07VGroqOperatorEvidence(raw:unknown,nowIso:string):
  R07VGroqReadiness{
  if(!record(raw)||!exact(raw,[
    'schemaVersion','kind','provider','observedAt','plan','modelId',
    'organizationZdr','optionalRetentionFeatures','modelListed',
    'modelAvailableOnFreePlan','jsonSchemaSupport','rpm','rpd','tpm',
    'explicitNoBillableUsage','syntheticOnly','evidenceType',
  ])||raw.schemaVersion!==1||raw.kind!=='r07v_groq_operator_console_v1'||
    raw.provider!=='groq'||!strictTime(raw.observedAt)||
    !['free','developer','unknown'].includes(raw.plan as string)||
    !token(raw.modelId)||
    !['enabled','disabled','unknown'].includes(raw.organizationZdr as string)||
    !['disabled','enabled','unknown'].includes(raw.optionalRetentionFeatures as string)||
    !yes(raw.modelListed)||!yes(raw.modelAvailableOnFreePlan)||
    !yes(raw.jsonSchemaSupport)||!yes(raw.explicitNoBillableUsage)||
    !integer(raw.rpm)||!integer(raw.rpd)||!integer(raw.tpm)||
    raw.syntheticOnly!==true||raw.evidenceType!=='self_reported_unverified'||
    !strictTime(nowIso))
    throw Error('R07V_INVALID_OPERATOR_EVIDENCE');
  const reasons:R07VReason[]=[];
  const checked=Date.parse(raw.observedAt);
  const now=Date.parse(nowIso);
  if(checked>now||now-checked>24*60*60*1000)
    reasons.push('STALE_CONSOLE_REVIEW');
  if(raw.plan!=='free')reasons.push('FREE_PLAN_UNCONFIRMED');
  if(raw.modelListed!=='confirmed'||raw.modelAvailableOnFreePlan!=='confirmed')
    reasons.push('MODEL_UNAVAILABLE_OR_NOT_FREE');
  if(raw.jsonSchemaSupport!=='confirmed')
    reasons.push('MODEL_JSON_SCHEMA_UNCONFIRMED');
  if(raw.rpm===0||raw.rpd===0||raw.tpm===0)
    reasons.push('ORG_RATE_LIMIT_UNCONFIRMED');
  if(raw.explicitNoBillableUsage!=='confirmed')
    reasons.push('ZERO_BILLING_UNCONFIRMED');
  if(raw.organizationZdr!=='enabled')reasons.push('ZDR_NOT_ENABLED');
  if(raw.optionalRetentionFeatures!=='disabled')
    reasons.push('RETENTION_FEATURES_UNCONFIRMED');
  return {
    status:reasons.length?'blocked':'pending_independent_account_review',
    reasons,provider:'groq',modelId:raw.modelId as string,
    syntheticTestOnly:true,suggestedMaxRequests:2,
    accountIdentityVerified:false,accountFreeVerified:false,
    perModelPriceVerified:false,privacyApprovalVerified:false,
    canInvokeProvider:false,canAccessRealBusinessData:false,
    canChangeProduction:false,
  };
}
