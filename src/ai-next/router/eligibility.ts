/**
 * R05: fail-closed ModelEligibility v1 assessment.
 * Pure and isolated: the registry MUST be prepared by a trusted server adapter.
 * Catalog labels, model output and browser flags never grant free/private access.
 */
import type {AuthenticatedScope, ModelEligibility} from '../domain/contracts.js';
import {assertCoreContract, validateAuthenticatedScope} from '../domain/validation.js';

export type R05TaskClass =
  | 'local_greeting' | 'local_draft_start' | 'clarification' | 'general_conversation'
  | 'business_read' | 'document_read' | 'document_comparison'
  | 'financial_analysis' | 'structured_extraction' | 'long_context_reasoning'
  | 'quotation_preparation' | 'draft_modification' | 'approval_preparation'
  | 'unsupported';

export interface R05RequestNeeds {
  taskType:R05TaskClass;
  inputModalities:('text'|'image'|'pdf')[];
  inputEstimateTokens:number;
  requiredOutputSchema:'none'|'json_v1';
  privacyClass:'public_synthetic'|'internal_business'|'confidential';
  imageCount:number;
  pageCount:number;
  deadlineMs:number;
}
export interface TrustedModelRecord {
  providerId:string;
  modelId:string;
  registryVersion:string;
  capabilities:string[];
  inputModalities:('text'|'image'|'pdf')[];
  contextWindow:number|null;
  maxImages:number;
  maxPages:number|null;
  providerEnabled:boolean;
  credentialsPresent:boolean;
  accountFreeVerified:boolean;
  modelZeroCostVerified:boolean;
  quotaAvailable:boolean;
  privacyApproved:boolean;
  healthAvailable:boolean;
  // Trusted capability prior, not a self-reported model confidence score.
  qualityTier:'basic'|'capable'|'advanced';
  quotaGroupId:string;
}
export interface AssessedModel {
  record:TrustedModelRecord;
  assessment:ModelEligibility;
}
const banned = /mistral/i;
const finiteInt=(v:number)=>Number.isSafeInteger(v)&&v>=0;
const id=(v:string)=>typeof v==='string'&&v.length>0&&v.length<=160&&
  !/[\u0000-\u001f\u007f]/u.test(v);
const unique=(items:readonly string[])=>new Set(items).size===items.length;

export function requiredR05Capabilities(needs:R05RequestNeeds):string[] {
  const caps=['TEXT'];
  if(needs.requiredOutputSchema==='json_v1')caps.push('STRUCTURED_OUTPUT');
  if(needs.inputModalities.includes('image'))caps.push('VISION');
  if(needs.inputModalities.includes('pdf'))caps.push('NATIVE_DOCUMENT');
  if(['financial_analysis','long_context_reasoning','document_comparison'].includes(needs.taskType))
    caps.push('DEEP_REASONING');
  if(needs.taskType==='long_context_reasoning')caps.push('LARGE_CONTEXT');
  return caps;
}
export function assessR05Model(input:{
  scope:AuthenticatedScope;
  assessmentId:string;
  evaluatedAt:string;
  model:TrustedModelRecord;
  needs:R05RequestNeeds;
}):ModelEligibility {
  if(!validateAuthenticatedScope(input.scope))throw Error('R05_UNTRUSTED_SCOPE');
  const {model,needs}=input;
  if(!id(input.assessmentId)||!id(model.providerId)||!id(model.modelId)||
    !id(model.registryVersion)||!id(model.quotaGroupId)||
    !finiteInt(model.maxImages)||!finiteInt(needs.inputEstimateTokens)||
    !finiteInt(needs.imageCount)||!finiteInt(needs.pageCount)||
    !Number.isFinite(needs.deadlineMs)||needs.deadlineMs<0||
    (model.contextWindow!==null&&(!finiteInt(model.contextWindow)||model.contextWindow===0))||
    (model.maxPages!==null&&!finiteInt(model.maxPages))||
    !unique(model.capabilities)||!unique(model.inputModalities)||
    !unique(needs.inputModalities)||needs.inputModalities.length===0||
    needs.inputModalities.some(mod=>!['text','image','pdf'].includes(mod)))
    throw Error('R05_INVALID_MODEL_METADATA');
  const reasons:string[]=[];
  const accountEligibility:ModelEligibility['accountEligibility']=
    !model.providerEnabled?'disabled':!model.credentialsPresent?'missing_credentials':
    !model.quotaAvailable?'quota_exhausted':
    model.accountFreeVerified?'free_verified':'unverified';
  const priceEligibility:ModelEligibility['priceEligibility']=
    model.modelZeroCostVerified && model.accountFreeVerified?'verified_zero':'unknown';
  const privacyEligibility:ModelEligibility['privacyEligibility']=
    model.privacyApproved?'approved':'denied';
  if(accountEligibility!=='free_verified')reasons.push('account_'+accountEligibility);
  if(priceEligibility!=='verified_zero')reasons.push('price_not_verified_zero');
  if(privacyEligibility!=='approved')reasons.push('privacy_denied');
  if(banned.test(model.modelId)||banned.test(model.providerId))reasons.push('model_disallowed');
  const required=requiredR05Capabilities(needs);
  if(required.some(cap=>!model.capabilities.includes(cap)))reasons.push('missing_capability');
  if(needs.inputModalities.some(mod=>!model.inputModalities.includes(mod))||
    needs.imageCount>model.maxImages||
    (needs.pageCount>0&&(model.maxPages===null||needs.pageCount>model.maxPages)))
    reasons.push('unsupported_modality_or_limits');
  if(model.contextWindow===null){
    if(needs.inputEstimateTokens>8192)reasons.push('unknown_context_limit');
  }else if(needs.inputEstimateTokens>model.contextWindow)reasons.push('context_exceeded');
  if(!model.healthAvailable)reasons.push('unhealthy');
  if(needs.deadlineMs<1000)reasons.push('deadline_exhausted');
  const capabilityEligible=!reasons.some(reason=>[
    'model_disallowed','missing_capability','unsupported_modality_or_limits',
    'unknown_context_limit','context_exceeded'].includes(reason));
  const eligible=reasons.length===0;
  const assessment:ModelEligibility={
    schemaVersion:1,scope:structuredClone(input.scope),
    assessmentId:input.assessmentId,evaluatedAt:input.evaluatedAt,
    model:{
      providerId:model.providerId,modelId:model.modelId,registryVersion:model.registryVersion,
      supportedCapabilities:[...model.capabilities],
      modalityLimits:{maxImages:model.maxImages,maxPages:model.maxPages},
      contextWindow:model.contextWindow,
    },
    requestNeeds:{
      taskType:needs.taskType,inputModalities:[...needs.inputModalities],
      inputEstimateTokens:needs.inputEstimateTokens,
      requiredOutputSchema:needs.requiredOutputSchema,privacyClass:needs.privacyClass,
    },
    accountEligibility,priceEligibility,privacyEligibility,
    capabilityEligible,healthEligible:model.healthAvailable,eligible,reasons,
    budget:{maxRequests:3,timeoutMs:Math.max(0,Math.min(50_000,Math.floor(needs.deadlineMs))),
      maxAllowedCost:'0'},
    fallbackGroupId:model.quotaGroupId,
  };
  assertCoreContract('ModelEligibility',assessment);
  return assessment;
}
export function eligibleR05Pool(input:{
  scope:AuthenticatedScope;
  now:string;
  models:readonly TrustedModelRecord[];
  needs:R05RequestNeeds;
}):AssessedModel[]{
  const seen=new Set<string>(),result:AssessedModel[]=[];
  for(const model of input.models.slice(0,300)){
    const key=model.providerId+':'+model.modelId;
    if(seen.has(key))continue;
    seen.add(key);
    const assessment=assessR05Model({
      ...input,model,assessmentId:'eligibility-'+String(result.length+1),
      evaluatedAt:input.now,
    });
    result.push({record:model,assessment});
  }
  return result;
}
