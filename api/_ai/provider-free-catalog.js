// Live provider catalog metadata only: no inference, prompts, files or company data.
// A provider's "available" list is NOT proof of free pricing. Every catalog candidate
// must also match the explicitly documented free-tier model allowlist and an
// independently approved free/no-overage account configuration.
const FREE_GEMINI_CHAT = new Set([
  'gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.5-pro',
  'gemini-3.8-flash','gemini-3.6-flash','gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite','gemini-3-flash-preview'
]);
// Based on Workers AI's October 2026 published text-generation price list.
// Explicitly omits its paid-billing-required models, guard, embedding, audio,
// image-generation and gateway-only models. Requires Workers FREE plan proof;
// the same nominal free allocation on Workers PAID does not prevent overages.
const FREE_CF_CHAT = new Set([
  '@cf/meta/llama-3.2-1b-instruct','@cf/meta/llama-3.2-3b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/mistral/mistral-7b-instruct-v0.1',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fp8',
  '@cf/meta/llama-3.1-8b-instruct-awq',
  '@cf/meta/llama-3-8b-instruct','@cf/meta/llama-3-8b-instruct-awq',
  '@cf/meta/llama-2-7b-chat-fp16',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/google/gemma-3-12b-it',
  '@cf/qwen/qwq-32b','@cf/qwen/qwen2.5-coder-32b-instruct',
  '@cf/qwen/qwen3-30b-a3b-fp8','@cf/qwen/qwen3.8-27b',
  '@cf/openai/gpt-oss-120b','@cf/openai/gpt-oss-20b',
  '@cf/aisingapore/gemma-sea-lion-v4-27b-it',
  '@cf/ibm-granite/granite-4.0-h-micro',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/nvidia/nemotron-3-120b-a12b',
  '@cf/moonshotai/kimi-k2.5',
  '@cf/google/gemma-4-26b-a4b-it'
]);
const baseCaps=['TEXT','STRUCTURED_OUTPUT'];
const extendedCaps=['TEXT','STRUCTURED_OUTPUT','DEEP_REASONING','LARGE_CONTEXT'];
const safeId = value => typeof value==='string' && value.length<=160 && /^[-@a-zA-Z0-9._/]+$/.test(value);
const candidate=(provider,model,capabilities=baseCaps)=>({
  provider,model,enabled:true,freeTierEligible:true,maxImages:0,capabilities
});
export function eligibleGeminiFreeModels(payload) {
  const rows=Array.isArray(payload?.models)?payload.models:[];
  const seen=new Set(),result=[];
  for(const row of rows.slice(0,1000)){
    const id=String(row?.name||'').replace(/^models\//,'');
    if(!safeId(id)||!FREE_GEMINI_CHAT.has(id)||seen.has(id)||
       !Array.isArray(row?.supportedGenerationMethods)||
       !row.supportedGenerationMethods.includes('generateContent'))continue;
    seen.add(id);
    // Conservative text-only classification; unknown modalities are NOT promised.
    result.push(candidate('gemini',id,extendedCaps));
  }
  return result;
}
export function eligibleCloudflareFreeModels(payload) {
  const rows=Array.isArray(payload?.result)?payload.result:[];
  const seen=new Set(),result=[];
  for(const row of rows.slice(0,400)){
    const id=row?.name||row?.id;
    if(!safeId(id)||!FREE_CF_CHAT.has(id)||seen.has(id))continue;
    // The catalog query already selects text-generation; reject an explicit
    // different task even if the model name appears on the pricing page.
    const task=typeof row?.task==='string'?row.task:row?.task?.name;
    if(task && task!=='text-generation')continue;
    seen.add(id);result.push(candidate('cloudflare',id));
  }
  return result;
}
// Provider GETs use account keys for metadata only; they do not consume model
// inference or reveal keys in the URL. Failed / stale listings fail closed.
const cache=new Map();
async function readCatalog(provider,url,headers){
  const existing=cache.get(provider);
  if(existing&&Date.now()<existing.expires)return existing.models;
  if(existing?.pending)return existing.pending;
  const pending=(async()=>{
    const controller=new AbortController();
    let timeout;
    // Abort alone is not a deadline: a stalled fetch or response.text() may
    // ignore the signal. Race the full metadata exchange, not just the header.
    const stopped=new Promise((_,reject)=>{
      timeout=setTimeout(()=>{controller.abort();reject(Error('catalog timeout'));},1200);
    });
    const request=(async()=>{
      const response=await fetch(url,{method:'GET',headers,signal:controller.signal,redirect:'error'});
      if(!response.ok)return [];
      const text=await response.text();
      if(controller.signal.aborted||text.length>2_000_000)return [];
      const parsed=JSON.parse(text);
      return provider==='gemini'?eligibleGeminiFreeModels(parsed):eligibleCloudflareFreeModels(parsed);
    })();
    try{return await Promise.race([request,stopped]);}
    catch{return [];}
    finally{clearTimeout(timeout);}
  })();
  cache.set(provider,{pending,models:[],expires:0});
  const models=await pending;
  cache.set(provider,{models,expires:Date.now()+(models.length?600_000:30_000)});
  return models;
}
export async function verifiedAccountFreeCatalog(){
  const jobs=[];
  // Explicit server verification is separate from the sensitive-data approval.
  if(process.env.LOUREX_AI_GEMINI_FREE_PROJECT_VERIFIED==='true'&&process.env.GEMINI_API_KEY?.trim()){
    jobs.push(readCatalog('gemini','https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',{'x-goog-api-key':process.env.GEMINI_API_KEY.trim()}));
  }
  if(process.env.LOUREX_AI_CLOUDFLARE_FREE_PLAN_VERIFIED==='true'&&
     process.env.CLOUDFLARE_AI_API_TOKEN?.trim()&&process.env.CLOUDFLARE_ACCOUNT_ID?.trim()){
    const id=encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID.trim());
    jobs.push(readCatalog('cloudflare','https://api.cloudflare.com/client/v4/accounts/'+id+'/ai/models/search?task=text-generation&per_page=200&include_deprecated=false',
      {Authorization:'Bearer '+process.env.CLOUDFLARE_AI_API_TOKEN.trim()}));
  }
  return (await Promise.all(jobs)).flat();
}
