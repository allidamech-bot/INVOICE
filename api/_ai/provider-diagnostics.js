import {classifySyntheticProviderAnswer} from './provider-diagnostic-classifier.js';
import {FINANCIAL_QA_PROMPT,classifyFinancialAccuracyResponse} from './provider-financial-accuracy.js';

// Owner-triggered, synthetic-only AI provider smoke test.
// It never reads client context, business records, or provider fallback routing.
const SYNTHETIC_PROMPT='Synthetic accounting arithmetic test with NO customer or business data. An example order has 8 items priced at 125 USD each. Apply a 10% discount to the subtotal, then 18% tax to the discounted total. Reply ONLY with the numeric final total (no currency symbol, letters, separators or explanation).';
const MODEL={groq:'openai/gpt-oss-120b',ollama:'gemma4:31b'};
const MAX_RESPONSE_BYTES=24_000;
const PROVIDER_TIMEOUT_MS=12_000;

export const SYNTHETIC_PROVIDER_IDS=Object.freeze(Object.keys(MODEL));
// This alternate was listed in the owner's Ollama free-usage catalog.
// Keep it an explicit owner-triggered, synthetic-only comparison, not a live model switch.
export const OLLAMA_SYNTHETIC_MODELS=Object.freeze(['gemma4:31b','gpt-oss:20b']);

function settingsFor(provider){
  if(provider==='groq')return{key:process.env.GROQ_API_KEY?.trim(),url:'https://api.groq.com/openai/v1/chat/completions'};
  if(provider==='ollama')return{key:process.env.OLLAMA_API_KEY?.trim(),url:'https://ollama.com/api/chat'};
  return null;
}
function payloadFor(provider,mode='single',selectedModel=MODEL[provider]){
  const financial=mode==='financial',prompt=financial?FINANCIAL_QA_PROMPT:SYNTHETIC_PROMPT;
  if(provider==='ollama')return{model:selectedModel,messages:[{role:'user',content:prompt}],stream:false,options:{temperature:0,num_predict:financial?512:160},...(financial?{format:'json'}:{})};
  return{model:MODEL[provider],messages:[{role:'user',content:prompt}],temperature:0,
    max_completion_tokens:financial?384:160,reasoning_effort:'low',include_reasoning:false};
}
function safeCategory(status){
  if(status===401||status===403)return'KEY_REJECTED';
  if(status===402)return'PAYMENT_REQUIRED';
  if(status===429)return'RATE_LIMITED';
  if(status===400||status===404||status===422)return'MODEL_UNAVAILABLE';
  return status>=500?'PROVIDER_UNAVAILABLE':'PROVIDER_ERROR';
}
export async function runSyntheticProviderDiagnostic(provider,{fetchImpl=fetch,mode='single',model:requestedModel}={}){
  if(typeof provider!=='string'||!Object.prototype.hasOwnProperty.call(MODEL,provider))return{status:'INVALID_PROVIDER'};
  if(mode!=='single'&&mode!=='financial')return{status:'INVALID_DIAGNOSTIC_MODE'};
  // Never pass a browser-supplied arbitrary model ID upstream. Models other
  // than Ollama's verified free catalog selection cannot be overridden.
  if(requestedModel!==undefined&&(provider!=='ollama'||!OLLAMA_SYNTHETIC_MODELS.includes(requestedModel)))return{status:'INVALID_DIAGNOSTIC_MODEL'};
  const model=requestedModel||MODEL[provider];
  // These models may consume credits on a paid plan. Keys alone are never consent.
  if(provider==='ollama'&&process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED!=='true')return{provider,model,status:'FREE_TIER_NOT_VERIFIED',latencyMs:0,correct:false};
  const cfg=settingsFor(provider);
  if(!cfg?.key||!cfg.url)return{provider,model,status:'NOT_CONFIGURED',latencyMs:0,correct:false};
  const started=Date.now();
  const controller=new AbortController();
  let timeout;
  const deadline=new Promise((_,reject)=>{
    timeout=setTimeout(()=>{controller.abort();reject(new Error('DIAGNOSTIC_TIMEOUT'));},PROVIDER_TIMEOUT_MS);
  });
  try{
    const headers={'Content-Type':'application/json',Authorization:'Bearer '+cfg.key};
    const request=(async()=>{
      const response=await fetchImpl(cfg.url,{method:'POST',headers,body:JSON.stringify(payloadFor(provider,mode,model)),signal:controller.signal});
      // Bound a stalled or maliciously oversized JSON response. Nothing logged.
      const declared=Number(response.headers?.get?.('content-length')||0);
      if(declared>MAX_RESPONSE_BYTES)return{status:'INVALID_RESPONSE',reason:'RESPONSE_TOO_LARGE'};
      const raw=await response.text();
      if(raw.length>MAX_RESPONSE_BYTES)return{status:'INVALID_RESPONSE',reason:'RESPONSE_TOO_LARGE'};
      if(!response.ok)return{status:safeCategory(response.status)};
      let parsed;try{parsed=JSON.parse(raw);}catch{return{status:'INVALID_RESPONSE',reason:'UPSTREAM_NON_JSON'};}
      return mode==='financial'?classifyFinancialAccuracyResponse(parsed,provider):classifySyntheticProviderAnswer(parsed,provider);
    })();
    const result=await Promise.race([request,deadline]);
    return{provider,model,...result,latencyMs:Date.now()-started,correct:result.status==='PASSED'};
  }catch(error){
    const timedOut=controller.signal.aborted||error?.message==='DIAGNOSTIC_TIMEOUT';
    return{provider,model,status:timedOut?'TIMEOUT':'NETWORK_ERROR',latencyMs:Date.now()-started,correct:false};
  }finally{clearTimeout(timeout);}
}

 
// Read-only account authentication check. No chat/completion requests, prompts,
// customer data, model inference, or consumption of model-output tokens.
// The retained optional vendor exposes catalog checks only. Credential lookup cannot certify inference quota or pricing.
export async function checkProviderCredential(provider,{fetchImpl=fetch}={}){
  if(provider!=='ollama')return{status:'INVALID_PROVIDER'};
  const model=MODEL[provider],cfg=settingsFor(provider);
  if(!cfg?.key)return{provider,model,status:'NOT_CONFIGURED',inference:false,latencyMs:0};
  const url='https://ollama.com/api/tags';
  const started=Date.now(),controller=new AbortController();
  let timer;
  const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(new Error('CREDENTIAL_TIMEOUT'));},8_000);
  });
  try{
    const request=(async()=>{
      const response=await fetchImpl(url,{
        method:'GET',
        headers:{Authorization:'Bearer '+cfg.key,Accept:'application/json'},
        cache:'no-store',redirect:'error',signal:controller.signal
      });
      // Never inspect or return potentially sensitive upstream account metadata.
      if(response.body?.cancel)await Promise.race([response.body.cancel().catch(()=>{}),Promise.resolve()]);
      return{status:response.ok?'KEY_AUTHENTICATED':safeCategory(response.status)};
    })();
    const result=await Promise.race([request,deadline]);
    return{provider,model,...result,inference:false,latencyMs:Date.now()-started};
  }catch(error){
    return{provider,model,status:controller.signal.aborted||error?.message==='CREDENTIAL_TIMEOUT'?'TIMEOUT':'NETWORK_ERROR',
      inference:false,latencyMs:Date.now()-started};
  }finally{clearTimeout(timer);}
}

// Owner-visible deployment eligibility, never key validity or billing claims.
// Routing may still be blocked by task capabilities and data classification.
export function providerConfigurationSnapshot(env=process.env){
  const configured={groq:Boolean(env.GROQ_API_KEY?.trim()),ollama:Boolean(env.OLLAMA_API_KEY?.trim())};
  const optIn=env.LOUREX_AI_NEW_PROVIDERS_ENABLED==='true';
  const verified={ollama:env.LOUREX_AI_OLLAMA_FREE_VERIFIED==='true'};
  return SYNTHETIC_PROVIDER_IDS.map(provider=>{
    const keyReady=configured[provider],needsVerification=provider==='ollama';
    const external=needsVerification;
    const freeVerified=needsVerification?verified[provider]:null;
    return{provider,configured:keyReady,
      syntheticProbeAllowed:keyReady&&(!needsVerification||freeVerified===true),
      routerEnvironmentEligible:keyReady&&
        (!external||(optIn&&(!needsVerification||freeVerified===true))),
      freeVerified,privacyOptIn:external?optIn:null,diagnosticsOnly:false};
  });
}
