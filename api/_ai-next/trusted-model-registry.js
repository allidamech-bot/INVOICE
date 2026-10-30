/**
 * R05B server-only adapter for existing free-model discovery helpers.
 * No inference, no API routes, no request-body policy, no secrets returned.
 * It does NOT assert that any currently deployed account has free access.
 */
import {AI_MODEL_REGISTRY} from '../_ai/router.js';
import {eligibleGeminiFreeModels,eligibleCloudflareFreeModels}
  from '../_ai/provider-free-catalog.js';
import {freeOpenRouterModels} from '../_ai/free-model-catalog.js';

const ALLOWED_PROVIDERS=new Set(['groq','cloudflare','gemini','openrouter','ollama']);
const id=x=>typeof x==='string'&&x.length>0&&x.length<=160&&
  /^[-a-zA-Z0-9._/@:]+$/.test(x);
const flag=(env,key)=>env[key]==='true';
const words=(env,key)=>new Set(String(env[key]||'').split(',').map(s=>s.trim()).filter(Boolean));
const numeric=(x)=>Number.isSafeInteger(x)&&x>0?x:null;
const capacity=(m,defaults)=>({
  contextWindow:numeric(m.contextWindow)??numeric(m.context_length)??null,
  maxImages:Number.isSafeInteger(m.maxImages)&&m.maxImages>=0?m.maxImages:0,
  maxPages:Number.isSafeInteger(m.maxPages)&&m.maxPages>=0?m.maxPages:null,
  defaults,
});
function verification(env,provider){
  switch(provider){
    case 'groq':return {
      key:Boolean(env.GROQ_API_KEY?.trim()),
      free:flag(env,'LOUREX_AI_GROQ_FREE_ACCOUNT_VERIFIED'),
      models:words(env,'LOUREX_AI_GROQ_ZERO_COST_MODELS'),
    };
    case 'cloudflare':return {
      key:Boolean(env.CLOUDFLARE_AI_API_TOKEN?.trim()&&env.CLOUDFLARE_ACCOUNT_ID?.trim()),
      free:flag(env,'LOUREX_AI_CLOUDFLARE_FREE_PLAN_VERIFIED'),
      models:words(env,'LOUREX_AI_CLOUDFLARE_ZERO_COST_MODELS'),
    };
    case 'gemini':return {
      key:Boolean(env.GEMINI_API_KEY?.trim()),
      free:flag(env,'LOUREX_AI_GEMINI_FREE_PROJECT_VERIFIED'),
      models:words(env,'LOUREX_AI_GEMINI_ZERO_COST_MODELS'),
    };
    case 'openrouter':return {
      key:Boolean(env.OPENROUTER_API_KEY?.trim())&&flag(env,'LOUREX_AI_NEW_PROVIDERS_ENABLED'),
      free:flag(env,'LOUREX_AI_OPENROUTER_NO_OVERAGE_VERIFIED'),
      models:words(env,'LOUREX_AI_OPENROUTER_ZERO_COST_MODELS'),
    };
    case 'ollama':return {
      key:Boolean(env.OLLAMA_API_KEY?.trim())&&flag(env,'LOUREX_AI_NEW_PROVIDERS_ENABLED'),
      free:flag(env,'LOUREX_AI_OLLAMA_FREE_VERIFIED'),
      models:words(env,'LOUREX_AI_OLLAMA_ZERO_COST_MODELS'),
    };
    default:return {key:false,free:false,models:new Set()};
  }
}
/**
 * trusted metadata input must be loaded by a backend catalog fetcher, NEVER
 * forwarded from browser/LLM. No external catalog calls occur in this method.
 *
 * Everything in this registry is DENIED until explicit account-level,
 * per-model zero-cost, and privacy authorization are each independently set.
 */
export function buildR05TrustedRegistry({
  env=process.env,
  catalogResponses={},
  now=new Date().toISOString(),
}={}){
  const permissions=words(env,'LOUREX_AI_NEXT_APPROVED_PROVIDERS');
  const privatePermissions=words(env,'LOUREX_AI_APPROVED_PRIVATE_PROVIDERS');
  const rows=[
    ...AI_MODEL_REGISTRY,
    ...eligibleGeminiFreeModels(catalogResponses.gemini),
    ...eligibleCloudflareFreeModels(catalogResponses.cloudflare),
    ...freeOpenRouterModels(catalogResponses.openrouter),
  ];
  // Groq and Ollama may have server-verified catalog records; never accept
  // them from an untrusted network request body or model tool suggestion.
  for(const provider of ['groq','ollama']){
    const listed=Array.isArray(catalogResponses[provider]?.models)?
      catalogResponses[provider].models.slice(0,200):[];
    for(const item of listed){
      if(!id(item?.model)||!Array.isArray(item?.capabilities)||
        !item.capabilities.includes('TEXT'))continue;
      rows.push({...item,provider,enabled:true});
    }
  }
  // The user-configured provider allowlist, per-model zero-price proof and
  // privacy approval are the authority; name-based bans go stale. Do not
  // silently truncate the beginning of a long discovered model catalog.
  if(rows.length>1000)throw Error('R05_TRUSTED_REGISTRY_LIMIT');
  const models=[],seen=new Set();
  for(const candidate of rows){
    const providerId=candidate.provider,modelId=candidate.model;
    if(!ALLOWED_PROVIDERS.has(providerId)||!id(modelId)||
      modelId==='openrouter/free')continue;
    const k=providerId+':'+modelId;
    if(seen.has(k))continue;
    seen.add(k);
    const v=verification(env,providerId);
    // Every candidate must have account-verified cost. Neither static registry
    // freeTierEligible nor catalog pricing alone is sufficient for that.
    const caps=Array.isArray(candidate.capabilities)?
      [...new Set(candidate.capabilities.filter(id))]:[];
    const modalities=['text'];
    if(caps.includes('VISION'))modalities.push('image');
    if(caps.includes('NATIVE_DOCUMENT'))modalities.push('pdf');
    const limit=capacity(candidate);
    const credentialsPresent=v.key,accountFreeVerified=v.free,
      modelZeroCostVerified=v.models.has(modelId);
    const privacyApproved=permissions.has(providerId)&&
      privatePermissions.has(providerId);
    models.push({
      providerId,modelId,registryVersion:'r05-account-gated-v1',
      capabilities:caps,inputModalities:modalities,
      contextWindow:limit.contextWindow,maxImages:limit.maxImages,
      maxPages:limit.maxPages,providerEnabled:candidate.enabled!==false,
      credentialsPresent,accountFreeVerified,modelZeroCostVerified,
      quotaAvailable:flag(env,'LOUREX_AI_'+providerId.toUpperCase()+'_QUOTA_AVAILABLE_VERIFIED'),
      privacyApproved,healthAvailable:true,qualityTier:'basic',
      quotaGroupId:providerId+'-account',
    });
  }
  return {evaluatedAt:now,models};
}
