import {classifySyntheticProviderAnswer} from './provider-diagnostic-classifier.js';
import {FINANCIAL_QA_PROMPT,classifyFinancialAccuracyResponse} from './provider-financial-accuracy.js';

// Owner-triggered, synthetic-only AI provider smoke test.
// It never reads client context, business records, or provider fallback routing.
const SYNTHETIC_PROMPT='Synthetic accounting arithmetic test with NO customer or business data. An example order has 8 items priced at 125 USD each. Apply a 10% discount to the subtotal, then 18% tax to the discounted total. Reply ONLY with the numeric final total (no currency symbol, letters, separators or explanation).';
// The Kilo diagnostic pins a published $0/$0 per-token model. Avoid
// kilo-auto/free selecting a different reasoning model on each probe.
// This does NOT modify the business AI router or permit private input.
const MODEL={groq:'openai/gpt-oss-120b',cloudflare:'@cf/google/gemma-4-26b-a4b-it',gemini:'gemini-2.5-flash-lite',kilo:'google/gemma-4-26b-a4b-it:free',openrouter:'openrouter/free',mistral:'mistral-small-latest',ollama:'gemma4:31b'};
const MAX_RESPONSE_BYTES=24_000;
const PROVIDER_TIMEOUT_MS=12_000;

export const SYNTHETIC_PROVIDER_IDS=Object.freeze(Object.keys(MODEL));

function settingsFor(provider){
  switch(provider){
    case 'groq': return{key:process.env.GROQ_API_KEY?.trim(),url:'https://api.groq.com/openai/v1/chat/completions'};
    case 'cloudflare':{
      const account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
      return{key:process.env.CLOUDFLARE_AI_API_TOKEN?.trim(),url:account?'https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/ai/v1/chat/completions':'',account};
    }
    case 'gemini':return{key:process.env.GEMINI_API_KEY?.trim(),url:'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'};
    case 'kilo':return{key:process.env.KILO_API_KEY?.trim(),url:'https://ai-gateway.kilo.ai/api/v1/chat/completions'};
    case 'openrouter':return{key:process.env.OPENROUTER_API_KEY?.trim(),url:'https://openrouter.ai/api/v1/chat/completions'};
    case 'mistral':return{key:process.env.MISTRAL_API_KEY?.trim(),url:'https://api.mistral.ai/v1/chat/completions'};
    case 'ollama':return{key:process.env.OLLAMA_API_KEY?.trim(),url:'https://ollama.com/api/chat'};
    default:return null;
  }
}
function payloadFor(provider,mode='single'){
  const financial=mode==='financial',prompt=financial?FINANCIAL_QA_PROMPT:SYNTHETIC_PROMPT;
  if(provider==='gemini')return{contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0,maxOutputTokens:financial?512:256}};
  if(provider==='ollama')return{model:MODEL.ollama,messages:[{role:'user',content:prompt}],stream:false,options:{temperature:0,num_predict:financial?512:160},...(financial?{format:'json'}:{})};
  return{model:MODEL[provider],messages:[{role:'user',content:prompt}],
    temperature:0,
    ...(provider==='groq'?{max_completion_tokens:financial?384:160,reasoning_effort:'low',include_reasoning:false}:{}),
    ...(provider==='cloudflare'?{max_completion_tokens:256,chat_template_kwargs:{enable_thinking:false},options:{rejectIfBusy:true}}:{}),
    ...(provider==='kilo'?{max_tokens:financial?512:384}:{}),
    ...(provider==='openrouter'?{max_tokens:financial?512:192,provider:{data_collection:'deny'}}:{}),
    ...(provider==='mistral'?{max_tokens:financial?512:192,...(financial?{response_format:{type:'json_object'}}:{})}:{})};
}
function safeCategory(status){
  if(status===401||status===403)return'KEY_REJECTED';
  if(status===402)return'PAYMENT_REQUIRED';
  if(status===429)return'RATE_LIMITED';
  if(status===400||status===404||status===422)return'MODEL_UNAVAILABLE';
  return status>=500?'PROVIDER_UNAVAILABLE':'PROVIDER_ERROR';
}
export async function runSyntheticProviderDiagnostic(provider,{fetchImpl=fetch,mode='single'}={}){
  if(typeof provider!=='string'||!Object.prototype.hasOwnProperty.call(MODEL,provider))return{status:'INVALID_PROVIDER'};
  if(mode!=='single'&&mode!=='financial')return{status:'INVALID_DIAGNOSTIC_MODE'};
  const model=MODEL[provider];
  // These models may consume credits on a paid plan. Keys alone are never consent.
  if(provider==='mistral'&&process.env.LOUREX_AI_MISTRAL_FREE_VERIFIED!=='true')return{provider,model,status:'FREE_TIER_NOT_VERIFIED',latencyMs:0,correct:false};
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
    const headers={'Content-Type':'application/json',...(provider==='gemini'?{'x-goog-api-key':cfg.key}:{Authorization:'Bearer '+cfg.key})};
    const request=(async()=>{
      const response=await fetchImpl(cfg.url,{method:'POST',headers,body:JSON.stringify(payloadFor(provider,mode)),signal:controller.signal});
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
// This checks the credential, NOT eligibility for a free model or billing status.
export async function checkProviderCredential(provider,{fetchImpl=fetch}={}){
  if(provider!=='mistral'&&provider!=='ollama')return{status:'INVALID_PROVIDER'};
  const model=MODEL[provider],cfg=settingsFor(provider);
  if(!cfg?.key)return{provider,model,status:'NOT_CONFIGURED',inference:false,latencyMs:0};
  const url=provider==='mistral'?'https://api.mistral.ai/v1/models':'https://ollama.com/api/tags';
  const started=Date.now(),controller=new AbortController();
  let timer;
  const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(new Error('CREDENTIAL_TIMEOUT'));},8_000);
  });
  try{
    const request=fetchImpl(url,{
      method:'GET',headers:{Authorization:'Bearer '+cfg.key,Accept:'application/json'},
      cache:'no-store',redirect:'error',signal:controller.signal
    });
    const response=await Promise.race([request,deadline]);
    // Never inspect or return potentially sensitive account metadata.
    if(response.body?.cancel)await Promise.race([response.body.cancel().catch(()=>{}),Promise.resolve()]);
    return{provider,model,status:response.ok?'KEY_AUTHENTICATED':safeCategory(response.status),
      inference:false,latencyMs:Date.now()-started};
  }catch(error){
    return{provider,model,status:controller.signal.aborted||error?.message==='CREDENTIAL_TIMEOUT'?'TIMEOUT':'NETWORK_ERROR',
      inference:false,latencyMs:Date.now()-started};
  }finally{clearTimeout(timer);}
}
