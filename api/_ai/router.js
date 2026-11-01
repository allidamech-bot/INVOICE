import {openRouterFreeCatalog} from './free-model-catalog.js';
import {verifiedAccountFreeCatalog} from './provider-free-catalog.js';
import {randomUUID} from 'node:crypto';

const GROQ_CHAT_URL='https://api.groq.com/openai/v1/chat/completions';
const GEMINI_BASE_URL='https://generativelanguage.googleapis.com/v1beta/models';
const CLOUDFLARE_CHAT_PATH='/ai/v1/chat/completions';
const GEMINI_MODEL='gemini-2.5-flash-lite';
const DEFAULT_TIMEOUT_MS=18_000;
// Keep the entire provider fallback chain below the browser's 60-second request timeout.
const ROUTER_BUDGET_MS=50_000;
const PROVIDER_MIN_MS=3_000;
const ROUTER_SETTLE_RESERVE_MS=1_500;
const MAX_OUTPUT_TOKENS=4096;
const CIRCUIT_FAILURE_THRESHOLD=2;
const CIRCUIT_OPEN_MS=30_000;
const REJECTED_MODEL_OPEN_MS=300_000;
const MAX_PROVIDER_ATTEMPTS=2;
const RETRY_BASE_MS=125;

export const AI_FREE_ONLY=true;

export const AI_CAPABILITIES=Object.freeze({
  TEXT:'TEXT',
  VISION:'VISION',
  STRUCTURED_OUTPUT:'STRUCTURED_OUTPUT',
  DEEP_REASONING:'DEEP_REASONING',
  TOOL_CALLING:'TOOL_CALLING',
  LARGE_CONTEXT:'LARGE_CONTEXT',
  NATIVE_DOCUMENT:'NATIVE_DOCUMENT',
});

export const AI_MODEL_REGISTRY=Object.freeze([
  Object.freeze({provider:'groq',model:'qwen/qwen3.8-27b',enabled:true,freeTierEligible:true,maxImages:3,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.VISION,AI_CAPABILITIES.STRUCTURED_OUTPUT,AI_CAPABILITIES.DEEP_REASONING,AI_CAPABILITIES.TOOL_CALLING,AI_CAPABILITIES.LARGE_CONTEXT]}),
  Object.freeze({provider:'groq',model:'openai/gpt-oss-120b',enabled:true,freeTierEligible:true,maxImages:0,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.STRUCTURED_OUTPUT,AI_CAPABILITIES.DEEP_REASONING,AI_CAPABILITIES.TOOL_CALLING,AI_CAPABILITIES.LARGE_CONTEXT]}),
  Object.freeze({provider:'cloudflare',model:'@cf/google/gemma-4-26b-a4b-it',enabled:true,freeTierEligible:true,maxImages:3,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.VISION,AI_CAPABILITIES.STRUCTURED_OUTPUT,AI_CAPABILITIES.DEEP_REASONING,AI_CAPABILITIES.TOOL_CALLING,AI_CAPABILITIES.LARGE_CONTEXT]}),
  Object.freeze({provider:'cloudflare',model:'@cf/nvidia/nemotron-3-120b-a12b',enabled:true,freeTierEligible:true,maxImages:0,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.STRUCTURED_OUTPUT,AI_CAPABILITIES.DEEP_REASONING,AI_CAPABILITIES.TOOL_CALLING,AI_CAPABILITIES.LARGE_CONTEXT]}),
  Object.freeze({provider:'cloudflare',model:'@cf/openai/gpt-oss-120b',enabled:true,freeTierEligible:true,maxImages:0,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.STRUCTURED_OUTPUT,AI_CAPABILITIES.DEEP_REASONING,AI_CAPABILITIES.TOOL_CALLING,AI_CAPABILITIES.LARGE_CONTEXT]}),
  Object.freeze({provider:'gemini',model:GEMINI_MODEL,enabled:true,freeTierEligible:true,maxImages:8,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.VISION,AI_CAPABILITIES.STRUCTURED_OUTPUT,AI_CAPABILITIES.DEEP_REASONING,AI_CAPABILITIES.LARGE_CONTEXT,AI_CAPABILITIES.NATIVE_DOCUMENT]}),
  // OpenRouter is pinned to its free-only router; never allow a paid model ID here.
  Object.freeze({provider:'openrouter',model:'openrouter/free',enabled:true,freeTierEligible:true,maxImages:0,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.STRUCTURED_OUTPUT]}),
  // Ollama Cloud currently does not guarantee structured JSON; validate locally.
  Object.freeze({provider:'ollama',model:'gemma4:31b',enabled:true,freeTierEligible:true,maxImages:0,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.STRUCTURED_OUTPUT]}),
]);

// Additional published free-tier chat models. Admission still requires the
// explicit multi-model switch and private-provider policy below.
const EXTRA_FREE_MODELS=[
 {provider:'groq',model:'openai/gpt-oss-20b',enabled:true,freeTierEligible:true,maxImages:0,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.STRUCTURED_OUTPUT,AI_CAPABILITIES.DEEP_REASONING,AI_CAPABILITIES.TOOL_CALLING,AI_CAPABILITIES.LARGE_CONTEXT]},
 ...['gemini-2.5-flash','gemini-2.5-pro','gemini-3.8-flash','gemini-3.6-flash','gemini-3-flash-preview'].map(model=>({provider:'gemini',model,enabled:true,freeTierEligible:true,maxImages:8,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.VISION,AI_CAPABILITIES.STRUCTURED_OUTPUT,AI_CAPABILITIES.DEEP_REASONING,AI_CAPABILITIES.LARGE_CONTEXT,AI_CAPABILITIES.NATIVE_DOCUMENT]})),
 // The current Gemini Flash-Lite free-tier models are text JSON candidates only
 // until PDF/image capability is separately verified for this adapter and account.
 ...['gemini-3.5-flash-lite','gemini-3.1-flash-lite'].map(model=>({provider:'gemini',model,enabled:true,freeTierEligible:true,maxImages:0,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.STRUCTURED_OUTPUT]})),
];
function multiModelEnabled(){return process.env.LOUREX_AI_MULTI_MODEL_ENABLED==='true';}
// One capability pool; privacy approval narrows eligibility, never assigns a provider a job.
const PRIVATE_TEXT_MODELS=new Set(['groq:openai/gpt-oss-120b','cloudflare:@cf/google/gemma-4-26b-a4b-it']);
const PRIVATE_VISION_MODELS=new Set(['groq:qwen/qwen3.8-27b','cloudflare:@cf/google/gemma-4-26b-a4b-it']);
// Bounded, ephemeral observations from actual validated requests in this function instance.
// Cold starts use a stable prior. This is not a durable global leaderboard.
const performanceState=new Map();
const PERFORMANCE_TTL_MS=300_000;
function observe(model,bucket,valid,latencyMs){
  const key=`${bucket}:${modelKey(model.provider,model.model)}`,now=Date.now();
  const old=performanceState.get(key),previous=old&&now-old.updatedAt<PERFORMANCE_TTL_MS?old:{count:0,quality:0.8,latencyMs:3_000};
  performanceState.set(key,{count:Math.min(20,previous.count+1),quality:previous.quality*0.75+(valid?0.25:0),latencyMs:previous.latencyMs*0.75+Math.min(30_000,Math.max(0,latencyMs))*0.25,updatedAt:now});
}
function rankCandidates(models,bucket){
  const now=Date.now();
  const score=model=>{
    const stats=performanceState.get(`${bucket}:${modelKey(model.provider,model.model)}`);
    // Do not demote/promote a provider from one button press or a single result.
    if(!stats||stats.count<3||now-stats.updatedAt>=PERFORMANCE_TTL_MS)return 0;
    return (stats.quality-0.8)*100_000+(3_000-stats.latencyMs);
  };
  const ranked=models.map((model,index)=>({model,index,score:score(model)})).sort((a,b)=>b.score-a.score||a.index-b.index);
  // Select one model per vendor so a stalled shared account is not retried via another model.
  const seen=new Set(),first=[];
  for(const entry of ranked){if(!seen.has(entry.model.provider)){seen.add(entry.model.provider);first.push(entry.model);}}
  if(!multiModelEnabled())return first;
  const primary=new Set(first);
  return [...first,...ranked.map(entry=>entry.model).filter(model=>!primary.has(model))];
}

const circuitState=new Map();
// Per-function-instance rate-limit cooldown; provider accounts often share quotas
// across several models. Fail over immediately on 429 without retry storms.
const providerRateLimitUntil=new Map();
const modelRateLimitUntil=new Map();

function modelKey(provider,model){return `${provider}:${model}`;}
function findModel(provider,model){return AI_MODEL_REGISTRY.find(entry=>entry.provider===provider&&entry.model===model);}
function hasCapabilities(model,required){return required.every(capability=>model.capabilities.includes(capability));}
function environmentReady(provider){
  if(provider==='groq')return Boolean(process.env.GROQ_API_KEY?.trim());
  // The opt-in all-free pool must fail closed on billing/project eligibility.
  // Preserve the previously deployed legacy router until the opt-in is enabled.
  if(provider==='cloudflare')return Boolean(process.env.CLOUDFLARE_AI_API_TOKEN?.trim()&&process.env.CLOUDFLARE_ACCOUNT_ID?.trim())&&(!multiModelEnabled()||process.env.LOUREX_AI_CLOUDFLARE_FREE_PLAN_VERIFIED==='true');
  if(provider==='gemini')return Boolean(process.env.GEMINI_API_KEY?.trim())&&(!multiModelEnabled()||process.env.LOUREX_AI_GEMINI_FREE_PROJECT_VERIFIED==='true');
  // Keys alone never authorize moving sensitive business prompts to new vendors.
  // Opt-in only after reviewing each provider's privacy terms and free-plan limits.
  if(process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED!=='true')return false;
  if(provider==='openrouter')return Boolean(process.env.OPENROUTER_API_KEY?.trim());
  if(provider==='ollama')return process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED==='true'&&Boolean(process.env.OLLAMA_API_KEY?.trim())&&(!multiModelEnabled()||String(process.env.LOUREX_AI_OLLAMA_ZERO_COST_MODELS||'').split(',').map(value=>value.trim()).includes('gemma4:31b'));
  return false;
}
function circuitAvailable(provider,model){
  const now=Date.now(),quotaUntil=providerRateLimitUntil.get(provider)||0;
  if(quotaUntil>now||(modelRateLimitUntil.get(modelKey(provider,model))||0)>now)return false;
  if(quotaUntil)providerRateLimitUntil.delete(provider);
  const state=circuitState.get(modelKey(provider,model));
  return !state||!state.openUntil||now>=state.openUntil;
}
function retryAfterDurationMs(value){
  const text=String(value||'').trim();
  if(!text)return 60_000;
  const secs=Number(text);
  const millis=Number.isFinite(secs)?secs*1000:Date.parse(text)-Date.now();
  return Number.isFinite(millis)?Math.min(86_400_000,Math.max(30_000,millis)):60_000;
}
function recordSuccess(provider,model){circuitState.delete(modelKey(provider,model));}
function recordFailure(provider,model,category,retryAfterMs,status,quotaScope){
  if(!['timeout','rate_limit','unavailable','network','upstream'].includes(category))return;
  if(category==='rate_limit'){
    const until=Date.now()+(Number.isFinite(retryAfterMs)?retryAfterMs:60_000);
    if(quotaScope==='model')modelRateLimitUntil.set(modelKey(provider,model),until);else providerRateLimitUntil.set(provider,until);
  }
  const key=modelKey(provider,model),previous=circuitState.get(key)||{failures:0,openUntil:0};
  const failures=previous.failures+1;
  // A rejected credential/model will not recover by sending the next user's
  // prompt immediately. Quarantine this model only; other models may be usable.
  // Schema-specific 400 errors must never disable unrelated requests.
  const rejected=[401,403,404].includes(status);
  circuitState.set(key,{failures,openUntil:rejected?Date.now()+REJECTED_MODEL_OPEN_MS:failures>=CIRCUIT_FAILURE_THRESHOLD?Date.now()+CIRCUIT_OPEN_MS:0});
}
function safeRequestId(value){const text=String(value||'').trim();return /^[A-Za-z0-9._:-]{1,120}$/.test(text)?text:randomUUID();}
function safeTaskType(value){return String(value||'general').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,80)||'general';}
function telemetry(event,listener){
  const safe={requestId:event.requestId,taskType:event.taskType,provider:event.provider,model:event.model,status:event.status,category:event.category,latencyMs:event.latencyMs,fallbackIndex:event.fallbackIndex,attempt:event.attempt,schemaValid:event.schemaValid};
  if(['model','provider'].includes(event.quotaScope))safe.quotaScope=event.quotaScope;
  if(Number.isFinite(event.retryAfterMs)&&event.retryAfterMs>=0&&event.retryAfterMs<=86400000)safe.retryAfterMs=Math.round(event.retryAfterMs);
  if(typeof listener==='function'){try{listener({...safe,...(event.rejection?{rejection:event.rejection}:{})});}catch{}}
  if(event.status==='ok')return;
  console.warn('[LOUREX AI router]',safe);
}
function lowerType(value){return typeof value==='string'?value.toLowerCase():value;}
export function geminiSchemaToJsonSchema(schema){
  if(!schema||typeof schema!=='object')return schema;
  if(Array.isArray(schema))return schema.map(geminiSchemaToJsonSchema);
  const result={};
  for(const [key,value] of Object.entries(schema)){
    if(key==='nullable')continue;
    if(key==='type')result.type=lowerType(value);
    else if(key==='properties'){result.properties={};for(const [name,child] of Object.entries(value||{}))result.properties[name]=geminiSchemaToJsonSchema(child);}
    else if(key==='items')result.items=geminiSchemaToJsonSchema(value);
    else result[key]=geminiSchemaToJsonSchema(value);
  }
  if(schema.nullable===true){const type=lowerType(schema.type);if(type)result.type=[type,'null'];}
  const types=Array.isArray(result.type)?result.type:[result.type].filter(Boolean);
  if(types.includes('object')&&result.additionalProperties===undefined)result.additionalProperties=false;
  return result;
}
function jsonSchemaToGeminiSchema(schema){
  if(!schema||typeof schema!=='object')return schema;
  if(Array.isArray(schema))return schema.map(jsonSchemaToGeminiSchema);
  const result={};
  for(const [key,value] of Object.entries(schema)){
    if(key==='additionalProperties'||key==='$schema'||key==='$id'||key==='title')continue;
    if(key==='type'){
      if(Array.isArray(value)){const nonNull=value.find(item=>item!=='null');if(nonNull)result.type=String(nonNull).toUpperCase();if(value.includes('null'))result.nullable=true;}
      else result.type=String(value).toUpperCase();
    }else if(key==='properties'){result.properties={};for(const [name,child] of Object.entries(value||{}))result.properties[name]=jsonSchemaToGeminiSchema(child);}
    else if(key==='items')result.items=jsonSchemaToGeminiSchema(value);
    else result[key]=jsonSchemaToGeminiSchema(value);
  }
  return result;
}
function typeMatches(value,type){
  if(type==='null')return value===null;
  if(type==='object')return value!==null&&typeof value==='object'&&!Array.isArray(value);
  if(type==='array')return Array.isArray(value);
  if(type==='string')return typeof value==='string';
  if(type==='number')return typeof value==='number'&&Number.isFinite(value);
  if(type==='integer')return Number.isInteger(value);
  if(type==='boolean')return typeof value==='boolean';
  return true;
}
export function validateJsonSchema(value,schema){
  if(!schema||typeof schema!=='object')return true;
  const types=Array.isArray(schema.type)?schema.type:[schema.type].filter(Boolean);
  if(types.length&&!types.some(type=>typeMatches(value,type)))return false;
  if(schema.enum&&!schema.enum.includes(value))return false;
  if(typeof value==='string'){
    if(Number.isFinite(schema.minLength)&&value.length<schema.minLength)return false;
    if(Number.isFinite(schema.maxLength)&&value.length>schema.maxLength)return false;
    if(schema.pattern){try{if(!(new RegExp(schema.pattern)).test(value))return false;}catch{return false;}}
  }
  if(typeof value==='number'&&Number.isFinite(value)){
    if(Number.isFinite(schema.minimum)&&value<schema.minimum)return false;
    if(Number.isFinite(schema.maximum)&&value>schema.maximum)return false;
  }
  const activeType=types.find(type=>type!=='null');
  if(activeType==='object'&&value!==null&&typeof value==='object'&&!Array.isArray(value)){
    if(Array.isArray(schema.required)&&schema.required.some(name=>!Object.prototype.hasOwnProperty.call(value,name)))return false;
    for(const [name,child] of Object.entries(schema.properties||{})){if(Object.prototype.hasOwnProperty.call(value,name)&&!validateJsonSchema(value[name],child))return false;}
    if(schema.additionalProperties===false){const allowed=new Set(Object.keys(schema.properties||{}));if(Object.keys(value).some(name=>!allowed.has(name)))return false;}
  }
  if(activeType==='array'&&Array.isArray(value)){
    if(Number.isFinite(schema.minItems)&&value.length<schema.minItems)return false;
    if(Number.isFinite(schema.maxItems)&&value.length>schema.maxItems)return false;
    if(schema.items){for(const item of value)if(!validateJsonSchema(item,schema.items))return false;}
  }
  return true;
}
function parseJsonContent(content){
  if(content&&typeof content==='object'&&!Array.isArray(content))return content;
  const text=Array.isArray(content)?content.map(part=>typeof part==='string'?part:part?.text||'').join(''):String(content||'');
  if(!text.trim())return null;
  try{return JSON.parse(text);}catch{
    const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i);if(fenced){try{return JSON.parse(fenced[1]);}catch{return null;}}
    return null;
  }
}
function parseOpenAiPayload(payload){const root=payload?.result?.choices?payload.result:payload;return parseJsonContent(root?.choices?.[0]?.message?.content);}
function parseGeminiPayload(payload){const content=payload?.candidates?.[0]?.content?.parts?.map(part=>part?.text||'').join('')||'';return parseJsonContent(content);}
function normalizeMessages({messages,prompt,attachments=[]}){
  const base=Array.isArray(messages)&&messages.length?messages.map(message=>({role:message.role||'user',content:message.content})): [{role:'user',content:String(prompt||'')}];
  if(!attachments.length)return base;
  const lastUserIndex=[...base].map((message,index)=>({message,index})).reverse().find(entry=>entry.message.role==='user')?.index??base.length-1;
  const target=base[lastUserIndex]||{role:'user',content:''};
  const content=[];
  const current=target.content;
  if(Array.isArray(current))content.push(...current);else if(String(current||'').trim())content.push({type:'text',text:String(current)});
  for(const attachment of attachments){
    if(attachment?.kind!=='image')continue;
    const mime=String(attachment.mimeType||'image/jpeg');const data=String(attachment.data||'');
    if(data)content.push({type:'image_url',image_url:{url:`data:${mime};base64,${data}`}});
  }
  base[lastUserIndex]={...target,content};
  return base;
}
function geminiContents({messages,prompt,attachments=[]}){
  const normalized=Array.isArray(messages)&&messages.length?messages:[{role:'user',content:String(prompt||'')}];
  const contents=[];
  for(const message of normalized){
    const parts=[];const content=message.content;
    if(Array.isArray(content))for(const part of content){if(part?.type==='text'&&part.text)parts.push({text:String(part.text)});}
    else if(String(content||'').trim())parts.push({text:String(content)});
    contents.push({role:message.role==='assistant'?'model':'user',parts});
  }
  if(!contents.length)contents.push({role:'user',parts:[]});
  let user=null;for(let index=contents.length-1;index>=0;index-=1){if(contents[index].role==='user'){user=contents[index];break;}}if(!user)user=contents[contents.length-1];
  for(const attachment of attachments){if(attachment?.data&&attachment?.mimeType)user.parts.push({inlineData:{mimeType:String(attachment.mimeType),data:String(attachment.data)}});}
  return contents;
}
function attachmentValidation(attachments=[]){
  if(!Array.isArray(attachments))return{ok:false,code:'AI_UNSUPPORTED_MODALITY'};
  for(const attachment of attachments){
    if(attachment?.kind==='image'){
      if(!String(attachment.mimeType||'').toLowerCase().startsWith('image/')||!String(attachment.data||''))return{ok:false,code:'AI_UNSUPPORTED_MODALITY'};
      continue;
    }
    if(attachment?.kind==='native-document'){
      if(String(attachment.mimeType||'').toLowerCase()!=='application/pdf'||!String(attachment.data||''))return{ok:false,code:'AI_UNSUPPORTED_MODALITY'};
      continue;
    }
    return{ok:false,code:'AI_UNSUPPORTED_MODALITY'};
  }
  return{ok:true};
}
function classifyRoute({taskType,reasoningLevel,attachments=[]}){
  if(attachments.some(item=>item?.kind==='native-document'))return 'native-document';
  if(attachments.some(item=>item?.kind==='image'))return 'vision';
  if(reasoningLevel==='deep'||/cfo|report|profit|supplier_analysis|procurement|collections|anomaly|deep/i.test(String(taskType||'')))return 'deep';
  return 'general';
}
function requiredCapabilities(route){const base=[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.STRUCTURED_OUTPUT];if(route==='vision')base.push(AI_CAPABILITIES.VISION);if(route==='deep')base.push(AI_CAPABILITIES.DEEP_REASONING);if(route==='native-document')base.push(AI_CAPABILITIES.NATIVE_DOCUMENT);return base;}
function configuredCandidates(route,attachments=[],allowExternal=false,bucket=route,models=AI_MODEL_REGISTRY){
  const required=requiredCapabilities(route),imageCount=attachments.filter(item=>item?.kind==='image').length;
  // Private by default, including extraction, inbox and future server tasks.
  // Only the explicitly classified synthetic-help route may bypass this policy.
  const privateBusiness=!allowExternal;
  const approvedPrivate=new Set(route==='vision'?PRIVATE_VISION_MODELS:PRIVATE_TEXT_MODELS);
  // Deployment-side privacy approval, separate from credentials and free allowance.
  // Never accept this policy through a request body or task-name inference.
  const approvals=new Set(String(process.env.LOUREX_AI_APPROVED_PRIVATE_PROVIDERS||'').split(',').map(value=>value.trim()));
  if(approvals.has('gemini'))for(const entry of models.filter(m=>m.provider==='gemini'))approvedPrivate.add(modelKey(entry.provider,entry.model));
  if(multiModelEnabled())for(const entry of models.filter(m=>m.provider==='groq'||m.provider==='cloudflare'))approvedPrivate.add(modelKey(entry.provider,entry.model));
  if(approvals.has('openrouter'))for(const entry of models.filter(m=>m.provider==='openrouter'))approvedPrivate.add(modelKey(entry.provider,entry.model));
  if(approvals.has('ollama')&&route==='general')approvedPrivate.add('ollama:gemma4:31b');
  const eligible=models.filter(model=>model.enabled&&model.freeTierEligible&&hasCapabilities(model,required)&&environmentReady(model.provider)&&(['groq','cloudflare','gemini'].includes(model.provider)||allowExternal===true||approvedPrivate.has(modelKey(model.provider,model.model)))&&(!privateBusiness||approvedPrivate.has(modelKey(model.provider,model.model)))&&(!imageCount||model.maxImages>=imageCount));
  // Initial text prior uses the already repeatedly sampled GPT-OSS model.
  const prior=model=>model==='openai/gpt-oss-120b'?2:model==='openai/gpt-oss-20b'?1:0;
  eligible.sort((a,b)=>prior(b.model)-prior(a.model));
  return rankCandidates(eligible,bucket);
}
function providerError(provider,model,status,bodyText){
  // Groq may reject ONE oversized request against its free-plan TPM
  // ceiling with HTTP 413 + rate_limit_exceeded. Waiting or repeating an
  // identical request cannot make it fit; never classify it as a 429.
  if(status===413&&provider==='groq')
    return{category:'oversize',code:'AI_REQUEST_TOO_LARGE',retryable:false};
  if(status===429){
    if(provider==='cloudflare'){
      // Workers AI 3040 is temporary model capacity (e.g. rejectIfBusy), not
      // the 3036 daily-neuron account quota. Keep other models eligible.
      let upstream;
      try{upstream=JSON.parse(bodyText);}catch{}
      const codes=[upstream?.error?.code,...(Array.isArray(upstream?.errors)?upstream.errors.slice(0,8).map(item=>item?.code):[])];
      if(codes.some(code=>String(code)==='3040'))
        return{category:'upstream',code:'AI_UPSTREAM_ERROR',retryable:false};
      // 3036 and unrecognized 429s remain provider-wide, fail-safe.
    }
    let message='';try{message=String(JSON.parse(bodyText)?.error?.message||'').slice(0,4000);}catch{}
    // Only explicit provider wording may narrow quota scope. Unknown stays account-wide.
    const quotaScope=provider==='groq'&&message.includes('for model `'+model+'`')&&!/account-wide|organization-wide/i.test(message)?'model':'provider';
    return{category:'rate_limit',code:'AI_RATE_LIMITED',retryable:false,quotaScope};
  }
  if(status===408||status===504)return{category:'timeout',code:'AI_TIMEOUT',retryable:true};
  if((status===401||status===403)&&provider==='cloudflare'&&/paid|upgrade|5035/i.test(bodyText))return{category:'unavailable',code:'AI_FREE_TIER_UNAVAILABLE',retryable:false};
  if(status===401||status===403)return{category:'unavailable',code:'AI_PROVIDER_UNAVAILABLE',retryable:false};
  // Best-effort structured generation can reject the generated content with
  // HTTP 400. This says nothing about whether the model supports the request.
  if(status===400&&provider==='groq'){
    let code;try{code=JSON.parse(bodyText)?.error?.code;}catch{}
    if(code==='tool_use_failed')
      return{category:'invalid',code:'AI_TOOL_GENERATION_FAILED',retryable:false};
    if(code==='json_validate_failed'||/Generated JSON does not match the expected schema/i.test(bodyText))return{category:'schema',code:'AI_INVALID_RESULT',retryable:false};
  }
  if(status===400&&/model|schema|response_format|unsupported/i.test(bodyText))return{category:'unsupported',code:'AI_MODEL_UNSUPPORTED',retryable:false};
  if(status===404)return{category:'unavailable',code:'AI_MODEL_UNAVAILABLE',retryable:false};
  if(status>=500)return{category:'upstream',code:'AI_UPSTREAM_ERROR',retryable:true};
  return{category:'upstream',code:'AI_UPSTREAM_ERROR',retryable:false};
}
// Enumerated protocol metadata only. Never return the upstream message, values,
// failed generation, or arbitrary code/parameter strings to a caller or logs.
function groqRejection(status,text){
  if(status!==400)return undefined;
  let error;try{error=JSON.parse(text)?.error;}catch{}
  const codes=['invalid_request_error','json_validate_failed','tool_use_failed','invalid_json_schema','model_not_found','model_not_supported','unsupported_parameter','context_length_exceeded'];
  const names=['response_format','json_schema','strict','include_reasoning','reasoning_effort','reasoning_format','max_completion_tokens','max_tokens','temperature','additionalProperties','required','model','messages'];
  const code=codes.includes(error?.code)?error.code:'unknown';
  const params=[...names,'response_format.json_schema','response_format.json_schema.schema','response_format.json_schema.strict'];
  const param=params.includes(error?.param)?error.param:'unknown';
  const message=typeof error?.message==='string'?error.message:'';
  const fields=names.filter(name=>new RegExp(`\\b${name}\\b`,'i').test(message));
  return{status,code,param,fields};
}
async function fetchWithTimeout(url,options,timeoutMs){
  const controller=new AbortController();let timeout;
  // Abort alone is insufficient: a stalled response.text() can ignore the signal.
  // Race the complete fetch + body read against the same hard deadline.
  const timedOut=new Promise((_,reject)=>{
    timeout=setTimeout(()=>{controller.abort();reject(new DOMException('Provider response timed out','AbortError'));},timeoutMs);
  });
  const request=(async()=>{
    const response=await fetch(url,{...options,signal:controller.signal});
    const text=await response.text();
    if(controller.signal.aborted)throw new DOMException('Provider response timed out','AbortError');
    return{response,text};
  })();
  try{return await Promise.race([request,timedOut]);}finally{clearTimeout(timeout);}
}
// R07X Groq legacy chat protection. Free-tier GPT-OSS/Qwen accounts have
// a published 8K combined TPM ceiling. This conservative preflight only
// covers text chat, not nested extraction/vision tokenization or shared quotas.
// Never truncate user/customer context or silently switch to a paid model.
const GROQ_TEXT_TPM_CEILING=8_000;
const GROQ_PREFLIGHT_RESERVE=512;
function groqTextBudgetFits(request){
  if((request.attachments||[]).length)return true; // Image tokens need provider-specific measurement.
  const schema=geminiSchemaToJsonSchema(request.schema);
  const messages=normalizeMessages(request);
  const inputBytes=Buffer.byteLength(JSON.stringify(messages),'utf8')+
    Buffer.byteLength(JSON.stringify(schema??{}),'utf8');
  const maxOutput=Math.min(request.maxOutputTokens||MAX_OUTPUT_TOKENS,MAX_OUTPUT_TOKENS);
  return inputBytes+maxOutput+GROQ_PREFLIGHT_RESERVE<=GROQ_TEXT_TPM_CEILING;
}
// Strict output is safe only for a complete, closed schema using the
// documented basic Groq subset. Partial/advanced schemas stay best-effort
// with existing local validation; never fabricate missing properties.
function groqAutoStrictCompatible(schema){
  const types=new Set(['object','array','string','number','integer','boolean','null']);
  const keys=new Set(['type','properties','required','additionalProperties',
    'items','enum','description']);
  const seen=new WeakSet();
  function valid(node){
    if(!node||typeof node!=='object'||Array.isArray(node)||seen.has(node))
      return false;
    seen.add(node);
    if(Object.keys(node).some(key=>!keys.has(key)))return false;
    const type=Array.isArray(node.type)?node.type:[node.type];
    if(type.length===0||type.some(t=>!types.has(t)))return false;
    if(type.includes('object')){
      if(node.additionalProperties!==false||!node.properties||
        typeof node.properties!=='object'||Array.isArray(node.properties)||
        !Array.isArray(node.required))return false;
      const properties=Object.keys(node.properties);
      if(node.required.length!==properties.length||
        new Set(node.required).size!==properties.length||
        node.required.some(key=>!properties.includes(key)))return false;
      for(const field of properties)if(!valid(node.properties[field]))return false;
    }else if(node.properties!==undefined||node.required!==undefined||
      node.additionalProperties!==undefined)return false;
    if(type.includes('array')){
      if(!node.items||!valid(node.items))return false;
    }else if(node.items!==undefined)return false;
    return node.enum===undefined||Array.isArray(node.enum);
  }
  return valid(schema);
}
function groqReasoningOptions(model,reasoningLevel){
  if(model.model.startsWith('openai/gpt-oss-'))return{reasoning_effort:reasoningLevel==='deep'?'medium':'low',include_reasoning:false};
  return{reasoning_format:'hidden',reasoning_effort:reasoningLevel==='deep'?'medium':'none'};
}
async function callGroq(model,request){
  const apiKey=process.env.GROQ_API_KEY?.trim();if(!apiKey)throw Object.assign(new Error('not configured'),{routerCategory:'unavailable',routerCode:'AI_NOT_CONFIGURED',retryable:false});
  const schema=geminiSchemaToJsonSchema(request.schema);
  const supportedStrict=['openai/gpt-oss-120b','openai/gpt-oss-20b',
    'qwen/qwen3.8-27b'].includes(model.model);
  const useStrict=request.strictOutput===true||
    request.taskType==='supplier_purchase_extract'||
    (supportedStrict&&groqAutoStrictCompatible(schema));
  const body={model:model.model,messages:normalizeMessages(request),
    // No executable tools are supplied by this structured-proposal router.
    // Forbid a generated tool call, including when a prompt mentions tools.
    tool_choice:'none',
    temperature:0,max_completion_tokens:Math.min(
      request.maxOutputTokens||MAX_OUTPUT_TOKENS,MAX_OUTPUT_TOKENS),
    response_format:{type:'json_schema',json_schema:{
      name:'lourex_result',strict:useStrict,schema}},
    ...groqReasoningOptions(model,request.reasoningLevel)};
  const {response,text}=await fetchWithTimeout(GROQ_CHAT_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify(body)},request.timeoutMs);
  if(!response.ok){const info=providerError(model.provider,model.model,response.status,text);throw Object.assign(new Error(info.code),{routerCategory:info.category,routerCode:info.code,quotaScope:info.quotaScope,status:response.status,rejection:groqRejection(response.status,text),retryable:info.retryable,retryAfterMs:response.status===429?retryAfterDurationMs(response.headers?.get?.('retry-after')):undefined});}
  let payload;try{payload=JSON.parse(text);}catch{throw Object.assign(new Error('invalid upstream json'),{routerCategory:'invalid',routerCode:'AI_INVALID_RESULT',retryable:false});}
  // Valid JSON is not proof that Groq finished. A length-capped answer may
  // parse cleanly but silently omit key details. Never accept a phantom tool
  // call, an incomplete answer or content-filtered output as a success.
  const choice=payload?.choices?.[0]||payload?.result?.choices?.[0];
  const finish=choice?.finish_reason;
  // A provider-side moderation stop must NOT be bypassed by retrying the
  // same prompt on a different vendor. Fail closed with no fallback.
  if(finish==='content_filter')
    throw Object.assign(new Error('Groq response blocked'),{
      routerCategory:'blocked',routerCode:'AI_OUTPUT_BLOCKED',retryable:false});
  if(['length','max_tokens','tool_calls'].includes(finish)||
    (Array.isArray(choice?.message?.tool_calls)&&choice.message.tool_calls.length>0))
    throw Object.assign(new Error('incomplete Groq completion'),{
      routerCategory:'invalid',routerCode:'AI_INVALID_RESULT',retryable:false});
  return{data:parseOpenAiPayload(payload),headers:response.headers};
}
async function callCloudflare(model,request){
  const token=process.env.CLOUDFLARE_AI_API_TOKEN?.trim(),accountId=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();if(!token||!accountId)throw Object.assign(new Error('not configured'),{routerCategory:'unavailable',routerCode:'AI_NOT_CONFIGURED',retryable:false});
  const schema=geminiSchemaToJsonSchema(request.schema);
  const nativeSchema=model.catalogDiscovered!==true||model.jsonSchemaSupported===true;
  // Some discovered free text models lack Cloudflare's documented JSON Mode.
  // Use an explicit JSON instruction and the existing local schema validator
  // instead of sending a response_format parameter that the model rejects.
  const body={model:model.model,
    messages:nativeSchema?normalizeMessages(request):additionalProviderMessages(request),
    temperature:0,max_completion_tokens:Math.min(request.maxOutputTokens||MAX_OUTPUT_TOKENS,MAX_OUTPUT_TOKENS),
    ...(nativeSchema?{response_format:{type:'json_schema',json_schema:schema}}:{}),
    options:{rejectIfBusy:true}};
  const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${CLOUDFLARE_CHAT_PATH}`;
  const {response,text}=await fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(body)},request.timeoutMs);
  if(!response.ok){const info=providerError(model.provider,model.model,response.status,text);throw Object.assign(new Error(info.code),{routerCategory:info.category,routerCode:info.code,quotaScope:info.quotaScope,status:response.status,retryable:info.retryable,retryAfterMs:response.status===429?retryAfterDurationMs(response.headers?.get?.('retry-after')):undefined});}
  let payload;try{payload=JSON.parse(text);}catch{throw Object.assign(new Error('invalid upstream json'),{routerCategory:'invalid',routerCode:'AI_INVALID_RESULT',retryable:false});}
  return{data:parseOpenAiPayload(payload),headers:response.headers};
}
async function callGemini(model,request){
  const apiKey=process.env.GEMINI_API_KEY?.trim();if(!apiKey)throw Object.assign(new Error('not configured'),{routerCategory:'unavailable',routerCode:'AI_NOT_CONFIGURED',retryable:false});
  const schema=request.schema?.type&&String(request.schema.type)===String(request.schema.type).toUpperCase()?request.schema:jsonSchemaToGeminiSchema(request.schema);
  const body={contents:geminiContents(request),generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema:schema}};
  const url=`${GEMINI_BASE_URL}/${encodeURIComponent(model.model)}:generateContent`;
  const {response,text}=await fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body)},request.timeoutMs);
  if(!response.ok){const info=providerError(model.provider,model.model,response.status,text);throw Object.assign(new Error(info.code),{routerCategory:info.category,routerCode:info.code,quotaScope:info.quotaScope,status:response.status,retryable:info.retryable,retryAfterMs:response.status===429?retryAfterDurationMs(response.headers?.get?.('retry-after')):undefined});}
  let payload;try{payload=JSON.parse(text);}catch{throw Object.assign(new Error('invalid upstream json'),{routerCategory:'invalid',routerCode:'AI_INVALID_RESULT',retryable:false});}
  return{data:parseGeminiPayload(payload),headers:response.headers};
}
// These adapters are text-only safety fallbacks; every result is still checked
// against the caller's server-owned JSON schema before it may be returned.
// Never send uploads to a fallback that cannot uphold native document semantics.
function additionalProviderMessages(request){
  const schema=geminiSchemaToJsonSchema(request.schema);
  return[{role:'system',content:'Return exactly one valid JSON object. Do not use markdown or explanations. Follow this JSON schema exactly, including field types and required properties: '+JSON.stringify(schema)},...normalizeMessages(request)];
}
async function callAdditionalProvider(model,request){
  const keys={
    openrouter:process.env.OPENROUTER_API_KEY?.trim(),
    ollama:process.env.OLLAMA_API_KEY?.trim()
  };
  const key=keys[model.provider];
  if(!key)throw Object.assign(new Error('not configured'),{routerCategory:'unavailable',routerCode:'AI_NOT_CONFIGURED',retryable:false});
  const config={
    openrouter:{url:'https://openrouter.ai/api/v1/chat/completions'},
    ollama:{url:'https://ollama.com/api/chat'}
  }[model.provider];
  if(!config)throw Object.assign(new Error('unknown provider'),{routerCategory:'unsupported',routerCode:'AI_MODEL_UNSUPPORTED',retryable:false});
  const maxTokens=Math.min(request.maxOutputTokens||MAX_OUTPUT_TOKENS,MAX_OUTPUT_TOKENS);
  const messages=additionalProviderMessages(request);
  const body=model.provider==='ollama'
    ?{model:model.model,messages,stream:false,options:{temperature:0,num_predict:maxTokens}}
    :{model:model.model,messages,temperature:0,max_tokens:maxTokens,
      provider:{data_collection:'deny',max_price:{prompt:0,completion:0}}};
  const {response,text}=await fetchWithTimeout(config.url,{method:'POST',headers:{
    'Content-Type':'application/json',
    Authorization:'Bearer '+key
  },body:JSON.stringify(body)},request.timeoutMs);
  if(!response.ok){const info=providerError(model.provider,model.model,response.status,text);throw Object.assign(new Error(info.code),{routerCategory:info.category,routerCode:info.code,quotaScope:info.quotaScope,status:response.status,retryable:info.retryable,retryAfterMs:response.status===429?retryAfterDurationMs(response.headers?.get?.('retry-after')):undefined});}
  let payload;try{payload=JSON.parse(text);}catch{throw Object.assign(new Error('invalid upstream json'),{routerCategory:'invalid',routerCode:'AI_INVALID_RESULT',retryable:false});}
  const parsed=model.provider==='ollama'?parseJsonContent(payload?.message?.content):parseOpenAiPayload(payload);
  return{data:parsed,headers:response.headers};
}
async function callProvider(model,request){
  if(model.provider==='groq')return callGroq(model,request);
  if(model.provider==='cloudflare')return callCloudflare(model,request);
  if(model.provider==='gemini')return callGemini(model,request);
  return callAdditionalProvider(model,request);
}
function rateLimitSnapshot(headers){if(!headers?.get)return null;const values={remainingRequests:headers.get('x-ratelimit-remaining-requests')||'',remainingTokens:headers.get('x-ratelimit-remaining-tokens')||'',retryAfter:headers.get('retry-after')||''};return Object.values(values).some(Boolean)?values:null;}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function hasLowConfidence(value){
  let low=false;
  function visit(current){
    if(low||current===null||current===undefined)return;
    if(Array.isArray(current)){for(const item of current)visit(item);return;}
    if(typeof current!=='object')return;
    for(const [key,item] of Object.entries(current)){
      const confidenceKey=key.toLowerCase();
      const groundedCustomer=confidenceKey==='customerconfidence'&&Boolean(current.customerName||current.customerEmail||current.customerPhone);
      if(confidenceKey==='confidence'||confidenceKey==='quantityconfidence'||confidenceKey==='productconfidence'||groundedCustomer){
        if(typeof item==='string'&&item.toLowerCase()==='low')low=true;
        if(typeof item==='number'&&Number.isFinite(item)&&item<0.5)low=true;
      }
      visit(item);
    }
  }
  visit(value);return low;
}
function retryableSameProvider(error,attempt){return attempt+1<MAX_PROVIDER_ATTEMPTS&&error?.retryable===true&&['timeout','network','upstream'].includes(error?.routerCategory);}

export async function routeAiStructured(options={}){
  const routeStartedAt=Date.now();
  const taskType=safeTaskType(options.taskType),requestId=safeRequestId(options.requestId),reasoningLevel=options.reasoningLevel==='deep'?'deep':'standard';
  const attachments=options.attachments||[],attachmentCheck=attachmentValidation(attachments);
  if(!AI_FREE_ONLY)return{success:false,errorCode:'AI_FREE_ONLY_REQUIRED',requestId,route:'none',fallbackUsed:false};
  if(!attachmentCheck.ok)return{success:false,errorCode:attachmentCheck.code,requestId,route:'unsupported',fallbackUsed:false};
  const route=classifyRoute({taskType,reasoningLevel,attachments});
  // Explicit server-side data classification is mandatory. Never infer safety from
  // task names (workspace_help can also carry private conversation memory).
  // Only explicitly classified workspace help can use the external sandbox.
  // A mistaken synthetic tag on extraction/business tasks never grants approval.
  // Existing business endpoints do not set this flag, so private prompts stay
  // on the original provider set even if project-wide opt-in is accidentally set.
  const allowExternal=options.externalDataClass==='public-synthetic'&&route==='general'&&taskType==='workspace_help';
  const bucket=`${route}:${options.strictOutput===true?'strict':'standard'}`;
  const multi=multiModelEnabled();
  // Catalog queries are metadata-only. A large catalog never fans out inference.
  const approvedOpenRouter=environmentReady('openrouter')&&(allowExternal||String(process.env.LOUREX_AI_APPROVED_PRIVATE_PROVIDERS||'').split(',').map(value=>value.trim()).includes('openrouter'));
  const [verified,openRouter]=multi?await Promise.all([
    verifiedAccountFreeCatalog(),
    approvedOpenRouter?openRouterFreeCatalog():Promise.resolve([])
  ]):[[],[]];
  const extras=EXTRA_FREE_MODELS.filter(model=>model.provider!=='gemini'||process.env.LOUREX_AI_GEMINI_FREE_PROJECT_VERIFIED==='true');
  const allModels=multi?[...AI_MODEL_REGISTRY,...extras,...verified,...openRouter]:AI_MODEL_REGISTRY;
  const modelIds=new Set();
  const models=allModels.filter(model=>{const id=modelKey(model.provider,model.model);if(modelIds.has(id))return false;modelIds.add(id);return true;});
  // A strict native-schema task must not use catalog models without documented
  // JSON Schema support. Non-strict chat remains usable with local validation.
  const candidates=configuredCandidates(route,attachments,allowExternal,bucket,models)
    .filter(model=>!(options.strictOutput===true&&model.provider==='cloudflare'&&model.catalogDiscovered===true&&!model.jsonSchemaSupported));
  const schema=options.schema,jsonSchema=geminiSchemaToJsonSchema(schema);
  let lastCode='AI_TEMPORARILY_UNAVAILABLE',lowConfidenceResult=null,attemptCount=0;
  // Internal callers may shorten the fallback chain, never extend its global cap.
  const totalBudgetMs=Number.isFinite(options.totalBudgetMs)?Math.max(0,Math.min(ROUTER_BUDGET_MS,options.totalBudgetMs)):ROUTER_BUDGET_MS;
  function finish(result){
    const timing={totalLatencyMs:Date.now()-routeStartedAt,attemptCount,eligibleModelCount:candidates.length,availableModelCount:candidates.filter(model=>circuitAvailable(model.provider,model.model)).length};
    // Metadata only: never log prompts, response content, credentials or business data.
    console.info('[LOUREX AI route]',{requestId,taskType,route,status:result.success?'ok':'failed',errorCode:result.errorCode,...timing});
    return{...result,...timing};
  }
  if(!candidates.length)return finish({success:false,errorCode:route==='native-document'?'AI_PRIVATE_DOCUMENT_UNAVAILABLE':'AI_NOT_CONFIGURED',requestId,route,fallbackUsed:false});
  providerRoute:
  for(let index=0;index<candidates.length;index+=1){
    const model=candidates[index];
    for(let attempt=0;attempt<MAX_PROVIDER_ATTEMPTS;attempt+=1){
      // A concurrent request may have opened a quota/circuit after candidate selection.
      if(!circuitAvailable(model.provider,model.model)){
        lastCode=Math.max(providerRateLimitUntil.get(model.provider)||0,modelRateLimitUntil.get(modelKey(model.provider,model.model))||0)>Date.now()?'AI_RATE_LIMITED':'AI_TEMPORARILY_UNAVAILABLE';
        break;
      }
      if(multiModelEnabled()&&attemptCount>=8)break providerRoute;
      const remaining=totalBudgetMs-(Date.now()-routeStartedAt);
      if(remaining<PROVIDER_MIN_MS+ROUTER_SETTLE_RESERVE_MS){lastCode='AI_TIMEOUT';break providerRoute;}
      // A large free-model catalog is not a large number of sequential chances:
      // cap fairness at four real opportunities, preserving vendor diversity and
      // a model-specific quota fallback without starving a normal 5s response.
      const futureModels=candidates.slice(index+1).filter(candidate=>circuitAvailable(candidate.provider,candidate.model));
      const vendorCount=new Set([model.provider,...futureModels.map(candidate=>candidate.provider)]).size;
      const sameVendorAlternative=futureModels.some(candidate=>candidate.provider===model.provider);
      const fairSlots=Math.min(4,vendorCount+(sameVendorAlternative?1:0));
      const futureReserve=Math.min(Math.max(0,fairSlots-1)*PROVIDER_MIN_MS,Math.max(0,remaining-PROVIDER_MIN_MS-ROUTER_SETTLE_RESERVE_MS));
      const fairWindow=options.fairBudget===true?Math.max(PROVIDER_MIN_MS,Math.floor((remaining-ROUTER_SETTLE_RESERVE_MS)/fairSlots)):30_000;
      const perAttemptMs=Math.min(fairWindow,30_000,Math.max(PROVIDER_MIN_MS,Number(options.timeoutMs)||DEFAULT_TIMEOUT_MS),remaining-ROUTER_SETTLE_RESERVE_MS-futureReserve);
      // Free-tier preflight before any inference attempt. Preserve exact
      // user context; if oversized, try only an already authorized alternate.
      // This is deliberately conservative (UTF-8 bytes >= usual text tokens).
      // This budget is currently limited to text chat: extraction tasks
      // have much larger nested schemas and separate source validation.
      // Do not break established quote/supplier/product extraction on a
      // conservative byte-based estimate; those still handle upstream 413.
      if(model.provider==='groq'&&
        ['business_copilot','workspace_help'].includes(taskType)&&
        !groqTextBudgetFits({
          messages:options.messages,prompt:options.prompt,
          attachments,schema:options.schema,maxOutputTokens:options.maxOutputTokens,
        })){
        lastCode='AI_REQUEST_TOO_LARGE';
        break;
      }
      const startedAt=Date.now();
      attemptCount+=1;
      try{
        const result=await callProvider(model,{taskType,prompt:options.prompt,messages:options.messages,attachments,schema,reasoningLevel,strictOutput:options.strictOutput===true,timeoutMs:Math.max(PROVIDER_MIN_MS,perAttemptMs),maxOutputTokens:options.maxOutputTokens});
        const schemaValid=validateJsonSchema(result.data,jsonSchema),customValid=schemaValid&&(typeof options.validate!=='function'||options.validate(result.data)!==false);
        if(!customValid){observe(model,bucket,false,Date.now()-startedAt);lastCode='AI_INVALID_RESULT';recordFailure(model.provider,model.model,'invalid');telemetry({requestId,taskType,provider:model.provider,model:model.model,status:'failed',category:'schema',latencyMs:Date.now()-startedAt,fallbackIndex:index,attempt:attempt+1,schemaValid:false},options.onDiagnostic);break;}
        const lowConfidence=hasLowConfidence(result.data);
        observe(model,bucket,!lowConfidence,Date.now()-startedAt);
        recordSuccess(model.provider,model.model);telemetry({requestId,taskType,provider:model.provider,model:model.model,status:'ok',category:lowConfidence?'low-confidence':'ok',latencyMs:Date.now()-startedAt,fallbackIndex:index,attempt:attempt+1,schemaValid:true},options.onDiagnostic);
        const accepted={success:true,data:result.data,provider:model.provider,model:model.model,latencyMs:Date.now()-startedAt,validation:{schema:true,lowConfidence,needsReview:lowConfidence},confidence:lowConfidence?'low':'validated',fallbackUsed:index>0,requestId,route,rateLimit:rateLimitSnapshot(result.headers)};
        if(lowConfidence&&options.qualityFallback===true&&index+1<candidates.length){lowConfidenceResult=lowConfidenceResult||accepted;break;}
        return finish(accepted);
      }catch(error){
        observe(model,bucket,false,Date.now()-startedAt);
        const category=error?.name==='AbortError'?'timeout':error?.routerCategory||'network',code=error?.name==='AbortError'?'AI_TIMEOUT':error?.routerCode||'AI_NETWORK_ERROR';lastCode=code;recordFailure(model.provider,model.model,category,error?.retryAfterMs,error?.status,error?.quotaScope);telemetry({requestId,taskType,provider:model.provider,model:model.model,status:'failed',category,quotaScope:error?.quotaScope,retryAfterMs:error?.retryAfterMs,rejection:error?.rejection,latencyMs:Date.now()-startedAt,fallbackIndex:index,attempt:attempt+1,schemaValid:false},options.onDiagnostic);
        if(category==='blocked')break providerRoute;
        if(multiModelEnabled()&&category==='rate_limit'&&error?.quotaScope==='model'){
          const next=candidates.findIndex((candidate,i)=>i>index&&candidate.provider===model.provider&&circuitAvailable(candidate.provider,candidate.model));
          if(next>index+1)candidates.splice(index+1,0,candidates.splice(next,1)[0]);
        }
        // A full timeout is already a failed attempt, not a reason to repeat it.
        // Always give an eligible alternate its turn before repeating a failed vendor.
        // A lone provider may still use its existing bounded transient retry.
        const alternateAvailable=candidates.slice(index+1).some(candidate=>circuitAvailable(candidate.provider,candidate.model));
        if(category!=='timeout'&&!alternateAvailable&&retryableSameProvider(error,attempt)){
          const delay=RETRY_BASE_MS*(attempt+1);
          if(Date.now()-routeStartedAt+delay+PROVIDER_MIN_MS+ROUTER_SETTLE_RESERVE_MS>=totalBudgetMs){lastCode='AI_TIMEOUT';break providerRoute;}
          await sleep(delay);continue;
        }
        break;
      }
    }
  }
  if(lowConfidenceResult)return finish({...lowConfidenceResult,fallbackUsed:true,validation:{...lowConfidenceResult.validation,needsReview:true}});
  return finish({success:false,errorCode:lastCode==='AI_NOT_CONFIGURED'?'AI_TEMPORARILY_UNAVAILABLE':lastCode,requestId,route,fallbackUsed:candidates.length>1});
}

export function aiRouterPublicError(result){
  const code=result?.errorCode||'AI_TEMPORARILY_UNAVAILABLE';
  if(code==='AI_UNSUPPORTED_MODALITY')return{status:400,code,message:'This file or input type is not supported by LOUREX AI.'};
  if(code==='AI_PRIVATE_DOCUMENT_UNAVAILABLE')return{status:503,code,message:'No approved private-data provider is available for native PDF processing. The document was not sent.'};
  if(code==='AI_RATE_LIMITED')return{status:429,code,message:'LOUREX AI is temporarily at capacity. Please try again shortly.'};
  if(code==='AI_REQUEST_TOO_LARGE')return{status:413,code,message:'This request exceeds the current AI provider size or token allowance. Reduce the request size or split the task; nothing was changed.'};
  if(code==='AI_OUTPUT_BLOCKED')return{status:422,code,message:'The AI response was blocked by the provider. No operation was executed.'};
  if(code==='AI_TOOL_GENERATION_FAILED')return{status:502,code,message:'The AI provider could not produce a valid structured action. No action was executed. Please reformulate the request.'};
  if(code==='AI_TIMEOUT')return{status:504,code,message:'LOUREX AI could not complete this request in time.'};
  if(code==='AI_NOT_CONFIGURED')return{status:503,code,message:'LOUREX AI is not configured yet.'};
  if(code==='AI_FREE_ONLY_REQUIRED')return{status:503,code,message:'LOUREX AI free-only routing is unavailable.'};
  return{status:503,code:'AI_TEMPORARILY_UNAVAILABLE',message:'LOUREX AI is temporarily unavailable. Please try again shortly.'};
}

export const toJsonSchema=geminiSchemaToJsonSchema;
