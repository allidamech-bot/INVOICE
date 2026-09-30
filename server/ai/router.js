import {randomUUID} from 'node:crypto';
import {AI_CAPABILITIES,AI_FREE_ONLY,AI_ROUTES,getModel,hasCapabilities} from './models.js';
import {validateAndProject} from './schema.js';
import {AiProviderError} from './errors.js';
import {runGroq} from './providers/groq.js';
import {runCloudflare} from './providers/cloudflare.js';
import {runGemini} from './providers/gemini.js';

const failures=new Map();
const CIRCUIT_FAILURES=3;
const CIRCUIT_MS=60_000;

function circuitKey(provider,model){return `${provider}:${model}`;}
function circuitOpen(provider,model){const state=failures.get(circuitKey(provider,model));return !!state&&state.count>=CIRCUIT_FAILURES&&Date.now()-state.lastFailure<CIRCUIT_MS;}
function markFailure(provider,model){const key=circuitKey(provider,model),state=failures.get(key)||{count:0,lastFailure:0};state.count+=1;state.lastFailure=Date.now();failures.set(key,state);}
function markSuccess(provider,model){failures.delete(circuitKey(provider,model));}
function safeParse(text){try{return JSON.parse(text);}catch{return null;}}
function providerConfigured(provider){if(provider==='groq')return !!process.env.GROQ_API_KEY?.trim();if(provider==='cloudflare')return !!process.env.CLOUDFLARE_AI_API_TOKEN?.trim()&&!!process.env.CLOUDFLARE_ACCOUNT_ID?.trim();if(provider==='gemini')return !!process.env.GEMINI_API_KEY?.trim();return false;}
function classifyRoute({route,attachments=[],reasoning='none',requiredCapabilities=[]}){
  if(route&&AI_ROUTES[route])return route;
  if(attachments.some(item=>item?.kind==='document'))return'nativeDocument';
  if(attachments.some(item=>item?.kind==='image')||requiredCapabilities.includes(AI_CAPABILITIES.VISION))return'vision';
  if(reasoning==='high'||requiredCapabilities.includes(AI_CAPABILITIES.DEEP_REASONING))return'deep';
  return'general';
}
function adapter(provider){if(provider==='groq')return runGroq;if(provider==='cloudflare')return runCloudflare;if(provider==='gemini')return runGemini;throw new AiProviderError('AI_PROVIDER_UNKNOWN','Unknown provider',{retryable:false});}
function modelCapabilitiesForRequest(attachments=[]){const needed=[];if(attachments.some(item=>item?.kind==='image'))needed.push(AI_CAPABILITIES.VISION);if(attachments.some(item=>item?.kind==='document'))needed.push(AI_CAPABILITIES.NATIVE_DOCUMENT);return needed;}

export async function runAi({taskType='general',prompt='',schema=null,attachments=[],route='',reasoning='none',requiredCapabilities=[],timeoutMs=18000,validate=null}={}){
  if(!AI_FREE_ONLY)throw new AiProviderError('AI_FREE_ONLY_REQUIRED','LOUREX AI free-only policy is required',{status:503,retryable:false});
  const requestId=randomUUID();const selectedRoute=classifyRoute({route,attachments,reasoning,requiredCapabilities});const required=[...new Set([AI_CAPABILITIES.TEXT,...(schema?[AI_CAPABILITIES.STRUCTURED_OUTPUT]:[]),...requiredCapabilities,...modelCapabilitiesForRequest(attachments)])];const candidates=AI_ROUTES[selectedRoute]||AI_ROUTES.general;let fallbackCount=0;let lastError=null;
  for(const [provider,model] of candidates){
    const entry=getModel(provider,model);if(!entry||!entry.enabled||!entry.freeOnly||!hasCapabilities(entry,required)||!providerConfigured(provider)||circuitOpen(provider,model)){fallbackCount+=1;continue;}
    const started=Date.now();
    try{
      const result=await adapter(provider)({model,prompt,schema,attachments,timeoutMs,reasoning,structuredMode:entry.structuredMode});let data=result.text;
      if(schema){const parsed=safeParse(result.text);if(parsed===null)throw new AiProviderError('AI_INVALID_JSON','Provider returned invalid JSON',{provider,model});const checked=validateAndProject(parsed,schema);if(!checked.ok)throw new AiProviderError('AI_SCHEMA_INVALID',checked.error,{provider,model});data=checked.value;}
      if(typeof validate==='function'){const verified=await validate(data,{provider,model,requestId});if(verified===false||verified?.ok===false)throw new AiProviderError('AI_VALIDATION_FAILED',verified?.error||'Result validation failed',{provider,model});if(verified?.value!==undefined)data=verified.value;}
      markSuccess(provider,model);return{success:true,data,text:result.text,provider,model,requestId,latencyMs:Date.now()-started,fallbackUsed:fallbackCount>0,fallbackCount,route:selectedRoute,validation:{schema:!!schema,passed:true}};
    }catch(error){lastError=error instanceof AiProviderError?error:new AiProviderError('AI_PROVIDER_ERROR','Provider failure',{provider,model,cause:error});markFailure(provider,model);console.warn('LOUREX AI provider failure',{requestId,taskType,provider,model,code:lastError.code,status:lastError.status,latencyMs:Date.now()-started});fallbackCount+=1;}
  }
  throw new AiProviderError('AI_TEMPORARILY_UNAVAILABLE','LOUREX AI is temporarily unavailable',{status:lastError?.status===429?429:503,retryable:true,cause:lastError});
}

export function providerHealth(){return AI_ROUTES.general.flat().length?{freeOnly:AI_FREE_ONLY,circuits:[...failures.entries()].map(([key,value])=>({key,count:value.count,lastFailure:value.lastFailure}))}:{freeOnly:AI_FREE_ONLY,circuits:[]};}
