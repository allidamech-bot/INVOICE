import {randomUUID} from 'node:crypto';

const GROQ_CHAT_URL='https://api.groq.com/openai/v1/chat/completions';
const GEMINI_BASE_URL='https://generativelanguage.googleapis.com/v1beta/models';
const CLOUDFLARE_CHAT_PATH='/ai/v1/chat/completions';
const GEMINI_MODEL='gemini-2.5-flash-lite';
const DEFAULT_TIMEOUT_MS=18_000;
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
]);

const GENERAL_ROUTE=[['groq','qwen/qwen3.8-27b'],['cloudflare','@cf/google/gemma-4-26b-a4b-it'],['gemini',GEMINI_MODEL]];
const VISION_ROUTE=[['groq','qwen/qwen3.8-27b'],['cloudflare','@cf/google/gemma-4-26b-a4b-it'],['gemini',GEMINI_MODEL]];
const DEEP_ROUTE=[['groq','openai/gpt-oss-120b'],['cloudflare','@cf/nvidia/nemotron-3-120b-a12b'],['cloudflare','@cf/openai/gpt-oss-120b'],['gemini',GEMINI_MODEL]];
const NATIVE_DOCUMENT_ROUTE=[['gemini',GEMINI_MODEL]];

const circuitState=new Map();

function modelKey(provider,model){return `${provider}:${model}`;}
function findModel(provider,model){return AI_MODEL_REGISTRY.find(entry=>entry.provider===provider&&entry.model===model);}
function hasCapabilities(model,required){return required.every(capability=>model.capabilities.includes(capability));}
function environmentReady(provider){
  if(provider==='groq')return Boolean(process.env.GROQ_API_KEY?.trim());
  if(provider==='cloudflare')return Boolean(process.env.CLOUDFLARE_AI_API_TOKEN?.trim()&&process.env.CLOUDFLARE_ACCOUNT_ID?.trim());
  if(provider==='gemini')return Boolean(process.env.GEMINI_API_KEY?.trim());
  return false;
}
function circuitAvailable(provider,model){const state=circuitState.get(modelKey(provider,model));return !state||!state.openUntil||Date.now()>=state.openUntil;}
function recordSuccess(provider,model){circuitState.delete(modelKey(provider,model));}
function recordFailure(provider,model,category){
  if(!['timeout','rate_limit','unavailable','network','upstream'].includes(category))return;
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
function configuredCandidates(route,attachments=[]){
  const required=requiredCapabilities(route),imageCount=attachments.filter(item=>item?.kind==='image').length;
  return routeEntries(route).map(([provider,model])=>findModel(provider,model)).filter(model=>model?.enabled&&model.freeTierEligible&&hasCapabilities(model,required)&&environmentReady(model.provider)&&circuitAvailable(model.provider,model.model)&&(!imageCount||model.maxImages>=imageCount));
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
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal});}finally{clearTimeout(timeout);}
}
async function callGroq(model,request){
  const apiKey=process.env.GROQ_API_KEY?.trim();if(!apiKey)throw Object.assign(new Error('not configured'),{routerCategory:'unavailable',routerCode:'AI_NOT_CONFIGURED',retryable:false});
  const schema=geminiSchemaToJsonSchema(request.schema);
  const body={model:model.model,messages:normalizeMessages(request),temperature:0,max_completion_tokens:Math.min(request.maxOutputTokens||MAX_OUTPUT_TOKENS,MAX_OUTPUT_TOKENS),response_format:{type:'json_schema',json_schema:{name:'lourex_result',strict:false,schema}},reasoning_format:'hidden',reasoning_effort:request.reasoningLevel==='deep'?'medium':'none'};
  const response=await fetchWithTimeout(GROQ_CHAT_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify(body)},request.timeoutMs);
  const text=await response.text();if(!response.ok){const info=providerError(model.provider,model.model,response.status,text);throw Object.assign(new Error(info.code),{routerCategory:info.category,routerCode:info.code,status:response.status,retryable:info.retryable});}
  let payload;try{payload=JSON.parse(text);}catch{throw Object.assign(new Error('invalid upstream json'),{routerCategory:'invalid',routerCode:'AI_INVALID_RESULT',retryable:false});}
  return{data:parseOpenAiPayload(payload),headers:response.headers};
}
async function callCloudflare(model,request){
  const token=process.env.CLOUDFLARE_AI_API_TOKEN?.trim(),accountId=process.env.CLOUDFLARE_ACCOUNT_ID?.trim();if(!token||!accountId)throw Object.assign(new Error('not configured'),{routerCategory:'unavailable',routerCode:'AI_NOT_CONFIGURED',retryable:false});
  const schema=geminiSchemaToJsonSchema(request.schema);
  const body={model:model.model,messages:normalizeMessages(request),temperature:0,max_tokens:Math.min(request.maxOutputTokens||MAX_OUTPUT_TOKENS,MAX_OUTPUT_TOKENS),response_format:{type:'json_schema',json_schema:{name:'lourex_result',schema}},options:{rejectIfBusy:true}};
  const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${CLOUDFLARE_CHAT_PATH}`;
  const response=await fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(body)},request.timeoutMs);
  const text=await response.text();if(!response.ok){const info=providerError(model.provider,model.model,response.status,text);throw Object.assign(new Error(info.code),{routerCategory:info.category,routerCode:info.code,status:response.status,retryable:info.retryable});}
  let payload;try{payload=JSON.parse(text);}catch{throw Object.assign(new Error('invalid upstream json'),{routerCategory:'invalid',routerCode:'AI_INVALID_RESULT',retryable:false});}
  return{data:parseOpenAiPayload(payload),headers:response.headers};
}
async function callGemini(model,request){
  const apiKey=process.env.GEMINI_API_KEY?.trim();if(!apiKey)throw Object.assign(new Error('not configured'),{routerCategory:'unavailable',routerCode:'AI_NOT_CONFIGURED',retryable:false});
  const schema=request.schema?.type&&String(request.schema.type)===String(request.schema.type).toUpperCase()?request.schema:jsonSchemaToGeminiSchema(request.schema);
  const body={contents:geminiContents(request),generationConfig:{temperature:0,responseMimeType:'application/json',responseSchema:schema}};
  const url=`${GEMINI_BASE_URL}/${encodeURIComponent(model.model)}:generateContent`;
  const response=await fetchWithTimeout(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body)},request.timeoutMs);
  const text=await response.text();if(!response.ok){const info=providerError(model.provider,model.model,response.status,text);throw Object.assign(new Error(info.code),{routerCategory:info.category,routerCode:info.code,status:response.status,retryable:info.retryable});}
  let payload;try{payload=JSON.parse(text);}catch{throw Object.assign(new Error('invalid upstream json'),{routerCategory:'invalid',routerCode:'AI_INVALID_RESULT',retryable:false});}
  return{data:parseGeminiPayload(payload),headers:response.headers};
}
async function callProvider(model,request){if(model.provider==='groq')return callGroq(model,request);if(model.provider==='cloudflare')return callCloudflare(model,request);return callGemini(model,request);}
function rateLimitSnapshot(headers){if(!headers?.get)return null;const values={remainingRequests:headers.get('x-ratelimit-remaining-requests')||'',remainingTokens:headers.get('x-ratelimit-remaining-tokens')||'',retryAfter:headers.get('retry-after')||''};return Object.values(values).some(Boolean)?values:null;}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function hasLowConfidence(value){
  let low=false;
  function visit(current){
    if(low||current===null||current===undefined)return;
    if(Array.isArray(current)){for(const item of current)visit(item);return;}
    if(typeof current!=='object')return;
    for(const [key,item] of Object.entries(current)){
      if(key.toLowerCase()==='confidence'){
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
  const candidates=configuredCandidates(route,attachments);
  if(!candidates.length)return{success:false,errorCode:'AI_NOT_CONFIGURED',requestId,route,fallbackUsed:false};
  const schema=options.schema,jsonSchema=geminiSchemaToJsonSchema(schema);
  let lastCode='AI_TEMPORARILY_UNAVAILABLE',lowConfidenceResult=null;
  for(let index=0;index<candidates.length;index+=1){
    const model=candidates[index];
    for(let attempt=0;attempt<MAX_PROVIDER_ATTEMPTS;attempt+=1){
      const startedAt=Date.now();
      try{
        const result=await callProvider(model,{taskType,prompt:options.prompt,messages:options.messages,attachments,schema,reasoningLevel,timeoutMs:Math.max(3_000,Math.min(30_000,Number(options.timeoutMs)||DEFAULT_TIMEOUT_MS)),maxOutputTokens:options.maxOutputTokens});
        const schemaValid=validateJsonSchema(result.data,jsonSchema),customValid=schemaValid&&(typeof options.validate!=='function'||options.validate(result.data)!==false);
        if(!customValid){lastCode='AI_INVALID_RESULT';recordFailure(model.provider,model.model,'invalid');telemetry({requestId,taskType,provider:model.provider,model:model.model,status:'failed',category:'schema',latencyMs:Date.now()-startedAt,fallbackIndex:index,attempt:attempt+1,schemaValid:false});break;}
        const lowConfidence=hasLowConfidence(result.data);
        recordSuccess(model.provider,model.model);telemetry({requestId,taskType,provider:model.provider,model:model.model,status:'ok',category:lowConfidence?'low-confidence':'ok',latencyMs:Date.now()-startedAt,fallbackIndex:index,attempt:attempt+1,schemaValid:true});
        const accepted={success:true,data:result.data,provider:model.provider,model:model.model,latencyMs:Date.now()-startedAt,validation:{schema:true,lowConfidence,needsReview:lowConfidence},confidence:lowConfidence?'low':'validated',fallbackUsed:index>0,requestId,route,rateLimit:rateLimitSnapshot(result.headers)};
        if(lowConfidence&&options.qualityFallback===true&&index+1<candidates.length){lowConfidenceResult=lowConfidenceResult||accepted;break;}
        return accepted;
      }catch(error){
        const category=error?.name==='AbortError'?'timeout':error?.routerCategory||'network',code=error?.name==='AbortError'?'AI_TIMEOUT':error?.routerCode||'AI_NETWORK_ERROR';lastCode=code;recordFailure(model.provider,model.model,category);telemetry({requestId,taskType,provider:model.provider,model:model.model,status:'failed',category,latencyMs:Date.now()-startedAt,fallbackIndex:index,attempt:attempt+1,schemaValid:false});
        if(retryableSameProvider(error,attempt)){await sleep(RETRY_BASE_MS*(attempt+1));continue;}
        break;
      }
    }
  }
  if(lowConfidenceResult)return{...lowConfidenceResult,fallbackUsed:true,validation:{...lowConfidenceResult.validation,needsReview:true}};
  return{success:false,errorCode:lastCode==='AI_NOT_CONFIGURED'?'AI_TEMPORARILY_UNAVAILABLE':lastCode,requestId,route,fallbackUsed:candidates.length>1};
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
