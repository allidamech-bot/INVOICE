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
  // Mistral must only be used once the operator verifies its free-plan/usage terms.
  Object.freeze({provider:'mistral',model:'mistral-small-latest',enabled:true,freeTierEligible:true,maxImages:0,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.STRUCTURED_OUTPUT]}),
  // Ollama Cloud currently does not guarantee structured JSON; validate locally.
  Object.freeze({provider:'ollama',model:'gemma4:31b',enabled:true,freeTierEligible:true,maxImages:0,capabilities:[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.STRUCTURED_OUTPUT]}),
]);

const GENERAL_ROUTE=[['groq','qwen/qwen3.8-27b'],['cloudflare','@cf/google/gemma-4-26b-a4b-it'],['gemini',GEMINI_MODEL],['openrouter','openrouter/free'],['mistral','mistral-small-latest'],['ollama','gemma4:31b']];
// Private business dialogue uses the financially probed model pair at every reasoning level.
// Do not change image/document routes or general-purpose extraction behavior.
const BUSINESS_COPILOT_ROUTE=[['groq','openai/gpt-oss-120b'],['cloudflare','@cf/google/gemma-4-26b-a4b-it']];
const VISION_ROUTE=[['groq','qwen/qwen3.8-27b'],['cloudflare','@cf/google/gemma-4-26b-a4b-it'],['gemini',GEMINI_MODEL]];
const DEEP_ROUTE=[['groq','openai/gpt-oss-120b'],['cloudflare','@cf/nvidia/nemotron-3-120b-a12b'],['cloudflare','@cf/openai/gpt-oss-120b'],['gemini',GEMINI_MODEL]];
const NATIVE_DOCUMENT_ROUTE=[['gemini',GEMINI_MODEL]];

const circuitState=new Map();
// Per-function-instance rate-limit cooldown; provider accounts often share quotas
// across several models. Fail over immediately on 429 without retry storms.
const providerRateLimitUntil=new Map();

function modelKey(provider,model){return `${provider}:${model}`;}
function findModel(provider,model){return AI_MODEL_REGISTRY.find(entry=>entry.provider===provider&&entry.model===model);}
function hasCapabilities(model,required){return required.every(capability=>model.capabilities.includes(capability));}
function environmentReady(provider){
  if(provider==='groq')return Boolean(process.env.GROQ_API_KEY?.trim());
  if(provider==='cloudflare')return Boolean(process.env.CLOUDFLARE_AI_API_TOKEN?.trim()&&process.env.CLOUDFLARE_ACCOUNT_ID?.trim());
  if(provider==='gemini')return Boolean(process.env.GEMINI_API_KEY?.trim());
  // Keys alone never authorize moving sensitive business prompts to new vendors.
  // Opt-in only after reviewing each provider's privacy terms and free-plan limits.
  if(process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED!=='true')return false;
  if(provider==='openrouter')return Boolean(process.env.OPENROUTER_API_KEY?.trim());
  if(provider==='mistral')return process.env.LOUREX_AI_MISTRAL_FREE_VERIFIED==='true'&&Boolean(process.env.MISTRAL_API_KEY?.trim());
  if(provider==='ollama')return process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED==='true'&&Boolean(process.env.OLLAMA_API_KEY?.trim());
  return false;
}
function circuitAvailable(provider,model){
  const now=Date.now(),quotaUntil=providerRateLimitUntil.get(provider)||0;
  if(quotaUntil>now)return false;
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
function recordFailure(provider,model,category,retryAfterMs){
  if(!['timeout','rate_limit','unavailable','network','upstream'].includes(category))return;
  if(category==='rate_limit'){
    providerRateLimitUntil.set(provider,Date.now()+(Number.isFinite(retryAfterMs)?retryAfterMs:60_000));
  }
  const key=modelKey(provider,model),previous=circuitState.get(key)||{failures:0,openUntil:0};
  const failures=previous.failures+1;
  circuitState.set(key,{failures,openUntil:failures>=CIRCUIT_FAILURE_THRESHOLD?Date.now()+CIRCUIT_OPEN_MS:0});
}
function safeRequestId(value){const text=String(value||'').trim();return /^[A-Za-z0-9._:-]{1,120}$/.test(text)?text:randomUUID();}
function safeTaskType(value){return String(value||'general').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,80)||'general';}
function telemetry(event){
  const safe={requestId:event.requestId,taskType:event.taskType,provider:event.provider,model:event.model,status:event.status,category:event.category,latencyMs:event.latencyMs,fallbackIndex:event.fallbackIndex,attempt:event.attempt,schemaValid:event.schemaValid};
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
function routeEntries(route){if(route==='vision')return VISION_ROUTE;if(route==='deep')return DEEP_ROUTE;if(route==='native-document')return NATIVE_DOCUMENT_ROUTE;return GENERAL_ROUTE;}
function requiredCapabilities(route){const base=[AI_CAPABILITIES.TEXT,AI_CAPABILITIES.STRUCTURED_OUTPUT];if(route==='vision')base.push(AI_CAPABILITIES.VISION);if(route==='deep')base.push(AI_CAPABILITIES.DEEP_REASONING);if(route==='native-document')base.push(AI_CAPABILITIES.NATIVE_DOCUMENT);return base;}
function configuredCandidates(route,attachments=[],allowExternal=false,taskType=''){
  const required=requiredCapabilities(route),imageCount=attachments.filter(item=>item?.kind==='image').length;
  // Tested Groq first, Cloudflare second. Fail closed when both are unavailable;
  // do not substitute Gemini (2/5 in live synthetic QA) or unapproved vendors for company finance dialogue.
  // Reasoning and attachments may narrow capabilities, never widen approval.
  const businessDialogue=['business_copilot','cfo_report'].includes(taskType);
  const sequence=businessDialogue?BUSINESS_COPILOT_ROUTE:routeEntries(route);
  return sequence.map(([provider,model])=>findModel(provider,model)).filter(model=>model?.enabled&&model.freeTierEligible&&hasCapabilities(model,required)&&environmentReady(model.provider)&&(['groq','cloudflare','gemini'].includes(model.provider)||allowExternal===true)&&(!imageCount||model.maxImages>=imageCount));
}
function providerError(provider,model,status,bodyText){
  if(status===429)return{category:'rate_limit',code:'AI_RATE_LIMITED',retryable:false};
  if(status===408||status===504)return{category:'timeout',code:'AI_TIMEOUT',retryable:true};
  if((status===401||status===403)&&provider==='cloudflare'&&/paid|upgrade|5035/i.test(bodyText))return{category:'unavailable',code:'AI_FREE_TIER_UNAVAILABLE',retryable:false};
  if(status===401||status===403)return{category:'unavailable',code:'AI_PROVIDER_UNAVAILABLE',retryable:false};
  if(status===400&&/model|schema|response_format|unsupported/i.test(bodyText))return{category:'unsupported',code:'AI_MODEL_UNSUPPORTED',retryable:false};
  if(status===404)return{category:'unavailable',code:'AI_MODEL_UNAVAILABLE',retryable:false};
  if(status>=500)return{category:'upstream',code:'AI_UPSTREAM_ERROR',retryable:true};
  return{category:'upstream',code:'AI_UPSTREAM_ERROR',retryable:false};
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
function groqReasoningOptions(model,reasoningLevel){
  if(model.model.startsWith('openai/gpt-oss-'))return{reasoning_effort:reasoningLevel==='deep'?'medium':'low',include_reasoning:false};
  return{reasoning_format:'hidden',reasoning_effort:reasoningLevel==='deep'?'medium':'none'};
}
async function callGroq(model,request){
  const apiKey=process.env.GROQ_API_KEY?.trim();if(!apiKey)throw Object.assign(new Error('not configured'),{routerCategory:'unavailable',routerCode:'AI_NOT_CONFIGURED',retryable:false});
  const schema=geminiSchemaToJsonSchema(request.schema);
  const body={model:model.model,messages:normalizeMessages(request),temperature:0,max_completion_tokens:Math.min(request.maxOutputTokens||MAX_OUTPUT_TOKENS,MAX_OUTPUT_TOKENS),response_format:{type:'json_schema',json_schema:{name:'lourex_result',strict:request.taskType==='supplier_purchase_extract',schema}},...groqReasoningOptions(model,request.reasoningLevel)};
  const {response,text}=await fetchWithTimeout(GROQ_CHAT_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify(body)},request.timeoutMs);
  if(!response.ok){const info=providerError(model.provider,model.model,response.status,text);throw Object.assign(new Error(info.code),{routerCategory:info.category,routerCode:info.code,status:response.status,retryable:info.retryable,retryAfterMs:response.status===429?retryAfterDurationMs(response.headers?.get?.('retry-after')):undefined});}
  let payload;try{payload=JSON.parse(text);}catch{throw Object.assign(new Error('invalid upstream json'),{routerCategory:'invalid',routerCode:'AI_INVALID_RESULT',retryable:false});}
  return{data:parseOpenAiPayload(payload),headers:response.headers};
}
async function callCloudflare(model,request){
  const token=process.env.CLOUDFLARE_AI_API_TOKEN?.trim(),accountId=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();if(!token||!accountId)throw Object.assign(new Error('not configured'),{routerCategory:'unavailable',routerCode:'AI_NOT_CONFIGURED',retryable:false});
  const schema=geminiSchemaToJsonSchema(request.schema);
  const body={model:model.model,messages:normalizeMessages(request),temperature:0,max_completion_tokens:Math.min(request.maxOutputTokens||MAX_OUTPUT_TOKENS,MAX_OUTPUT_TOKENS),response_format:{type:'json_schema',json_schema:schema},options:{rejectIfBusy:true}};
  const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${CLOUDFLARE_CHAT_PATH}`;
  const {response,text}=await fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(body)},request.timeoutMs);
  if(!response.ok){const info=providerError(model.provider,model.model,response.status,text);throw Object.assign(new Error(info.code),{routerCategory:info.category,routerCode:info.code,status:response.status,retryable:info.retryable,retryAfterMs:response.status===429?retryAfterDurationMs(response.headers?.get?.('retry-after')):undefined});}
  let payload;try{payload=JSON.parse(text);}catch{throw Object.assign(new Error('invalid upstream json'),{routerCategory:'invalid',routerCode:'AI_INVALID_RESULT',retryable:false});}
  return{data:parseOpenAiPayload(payload),headers:response.headers};
}
async function callGemini(model,request){
  const apiKey=process.env.GEMINI_API_KEY?.trim();if(!apiKey)throw Object.assign(new Error('not configured'),{routerCategory:'unavailable',routerCode:'AI_NOT_CONFIGURED',retryable:false});
  const schema=request.schema?.type&&String(request.schema.type)===String(request.schema.type).toUpperCase()?request.schema:jsonSchemaToGeminiSchema(request.schema);
  const body={contents:geminiContents(request),generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema:schema}};
  const url=`${GEMINI_BASE_URL}/${encodeURIComponent(model.model)}:generateContent`;
  const {response,text}=await fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body)},request.timeoutMs);
  if(!response.ok){const info=providerError(model.provider,model.model,response.status,text);throw Object.assign(new Error(info.code),{routerCategory:info.category,routerCode:info.code,status:response.status,retryable:info.retryable,retryAfterMs:response.status===429?retryAfterDurationMs(response.headers?.get?.('retry-after')):undefined});}
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
    mistral:process.env.MISTRAL_API_KEY?.trim(),
    ollama:process.env.OLLAMA_API_KEY?.trim()
  };
  const key=keys[model.provider];
  if(!key)throw Object.assign(new Error('not configured'),{routerCategory:'unavailable',routerCode:'AI_NOT_CONFIGURED',retryable:false});
  const config={
    openrouter:{url:'https://openrouter.ai/api/v1/chat/completions'},
    mistral:{url:'https://api.mistral.ai/v1/chat/completions'},
    ollama:{url:'https://ollama.com/api/chat'}
  }[model.provider];
  if(!config)throw Object.assign(new Error('unknown provider'),{routerCategory:'unsupported',routerCode:'AI_MODEL_UNSUPPORTED',retryable:false});
  const maxTokens=Math.min(request.maxOutputTokens||MAX_OUTPUT_TOKENS,MAX_OUTPUT_TOKENS);
  const messages=additionalProviderMessages(request);
  const body=model.provider==='ollama'
    ?{model:model.model,messages,stream:false,options:{temperature:0,num_predict:maxTokens}}
    :{model:model.model,messages,temperature:0,max_tokens:maxTokens,
      ...(model.provider==='mistral'?{response_format:{type:'json_object'}}:
        {provider:{data_collection:'deny'}})};
  const {response,text}=await fetchWithTimeout(config.url,{method:'POST',headers:{
    'Content-Type':'application/json',
    Authorization:'Bearer '+key
  },body:JSON.stringify(body)},request.timeoutMs);
  if(!response.ok){const info=providerError(model.provider,model.model,response.status,text);throw Object.assign(new Error(info.code),{routerCategory:info.category,routerCode:info.code,status:response.status,retryable:info.retryable,retryAfterMs:response.status===429?retryAfterDurationMs(response.headers?.get?.('retry-after')):undefined});}
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
  const candidates=configuredCandidates(route,attachments,allowExternal,taskType);
  if(!candidates.length)return{success:false,errorCode:'AI_NOT_CONFIGURED',requestId,route,fallbackUsed:false};
  const schema=options.schema,jsonSchema=geminiSchemaToJsonSchema(schema);
  let lastCode='AI_TEMPORARILY_UNAVAILABLE',lowConfidenceResult=null,attemptCount=0;
  const routeStartedAt=Date.now();
  function finish(result){
    const timing={totalLatencyMs:Date.now()-routeStartedAt,attemptCount};
    // Metadata only: never log prompts, response content, credentials or business data.
    console.info('[LOUREX AI route]',{requestId,taskType,route,status:result.success?'ok':'failed',errorCode:result.errorCode,...timing});
    return{...result,...timing};
  }
  providerRoute:
  for(let index=0;index<candidates.length;index+=1){
    const model=candidates[index];
    for(let attempt=0;attempt<MAX_PROVIDER_ATTEMPTS;attempt+=1){
      // A concurrent request may have opened a quota/circuit after candidate selection.
      if(!circuitAvailable(model.provider,model.model)){
        lastCode=(providerRateLimitUntil.get(model.provider)||0)>Date.now()?'AI_RATE_LIMITED':'AI_TEMPORARILY_UNAVAILABLE';
        break;
      }
      const remaining=ROUTER_BUDGET_MS-(Date.now()-routeStartedAt);
      if(remaining<PROVIDER_MIN_MS+ROUTER_SETTLE_RESERVE_MS){lastCode='AI_TIMEOUT';break providerRoute;}
      // Reserve a small window for later free-tier fallback models.
      const futureReserve=Math.min((candidates.length-index-1)*PROVIDER_MIN_MS,Math.max(0,remaining-PROVIDER_MIN_MS-ROUTER_SETTLE_RESERVE_MS));
      const perAttemptMs=Math.min(30_000,Math.max(PROVIDER_MIN_MS,Number(options.timeoutMs)||DEFAULT_TIMEOUT_MS),remaining-ROUTER_SETTLE_RESERVE_MS-futureReserve);
      const startedAt=Date.now();
      attemptCount+=1;
      try{
        const result=await callProvider(model,{taskType,prompt:options.prompt,messages:options.messages,attachments,schema,reasoningLevel,timeoutMs:Math.max(PROVIDER_MIN_MS,perAttemptMs),maxOutputTokens:options.maxOutputTokens});
        const schemaValid=validateJsonSchema(result.data,jsonSchema),customValid=schemaValid&&(typeof options.validate!=='function'||options.validate(result.data)!==false);
        if(!customValid){lastCode='AI_INVALID_RESULT';recordFailure(model.provider,model.model,'invalid');telemetry({requestId,taskType,provider:model.provider,model:model.model,status:'failed',category:'schema',latencyMs:Date.now()-startedAt,fallbackIndex:index,attempt:attempt+1,schemaValid:false});break;}
        const lowConfidence=hasLowConfidence(result.data);
        recordSuccess(model.provider,model.model);telemetry({requestId,taskType,provider:model.provider,model:model.model,status:'ok',category:lowConfidence?'low-confidence':'ok',latencyMs:Date.now()-startedAt,fallbackIndex:index,attempt:attempt+1,schemaValid:true});
        const accepted={success:true,data:result.data,provider:model.provider,model:model.model,latencyMs:Date.now()-startedAt,validation:{schema:true,lowConfidence,needsReview:lowConfidence},confidence:lowConfidence?'low':'validated',fallbackUsed:index>0,requestId,route,rateLimit:rateLimitSnapshot(result.headers)};
        if(lowConfidence&&options.qualityFallback===true&&index+1<candidates.length){lowConfidenceResult=lowConfidenceResult||accepted;break;}
        return finish(accepted);
      }catch(error){
        const category=error?.name==='AbortError'?'timeout':error?.routerCategory||'network',code=error?.name==='AbortError'?'AI_TIMEOUT':error?.routerCode||'AI_NETWORK_ERROR';lastCode=code;recordFailure(model.provider,model.model,category,error?.retryAfterMs);telemetry({requestId,taskType,provider:model.provider,model:model.model,status:'failed',category,latencyMs:Date.now()-startedAt,fallbackIndex:index,attempt:attempt+1,schemaValid:false});
        // A full timeout is already a failed attempt, not a reason to repeat it.
        // Keep quick transient retries, but let a healthy alternate have its turn
        // after a slow upstream failure instead of consuming another deadline.
        const alternateAvailable=candidates.slice(index+1).some(candidate=>circuitAvailable(candidate.provider,candidate.model));
        const slowFailure=Date.now()-startedAt>=perAttemptMs/2;
        if(category!=='timeout'&&!(alternateAvailable&&slowFailure)&&retryableSameProvider(error,attempt)){
          const delay=RETRY_BASE_MS*(attempt+1);
          if(Date.now()-routeStartedAt+delay+PROVIDER_MIN_MS+ROUTER_SETTLE_RESERVE_MS>=ROUTER_BUDGET_MS){lastCode='AI_TIMEOUT';break providerRoute;}
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
  if(code==='AI_RATE_LIMITED')return{status:429,code,message:'LOUREX AI is temporarily at capacity. Please try again shortly.'};
  if(code==='AI_TIMEOUT')return{status:504,code,message:'LOUREX AI could not complete this request in time.'};
  if(code==='AI_NOT_CONFIGURED')return{status:503,code,message:'LOUREX AI is not configured yet.'};
  if(code==='AI_FREE_ONLY_REQUIRED')return{status:503,code,message:'LOUREX AI free-only routing is unavailable.'};
  return{status:503,code:'AI_TEMPORARILY_UNAVAILABLE',message:'LOUREX AI is temporarily unavailable. Please try again shortly.'};
}
