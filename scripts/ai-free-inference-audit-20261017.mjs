/**
 * TEMPORARY, SYNTHETIC ONLY. Build-time free provider inference QA.
 * Do NOT check this script into main. It emits NO keys and NO model content.
 * Preserve existing privacy isolation and never load app/customer data.
 */
import {writeFileSync,mkdirSync} from 'node:fs';
import {routeAiStructured} from '../api/_ai/router.js';

const selected=['groq','gemini','cloudflare','openrouter'];
const envKeys=['GROQ_API_KEY','GEMINI_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','OPENROUTER_API_KEY','MISTRAL_API_KEY','OLLAMA_API_KEY','LOUREX_AI_NEW_PROVIDERS_ENABLED','LOUREX_AI_MISTRAL_FREE_VERIFIED','LOUREX_AI_OLLAMA_FREE_VERIFIED'];
const saved=Object.fromEntries(envKeys.map(x=>[x,process.env[x]]));
const originalFetch=globalThis.fetch;
const marker='LOUREX_FREE_PROBE_20261017';
const schema={type:'OBJECT',properties:{marker:{type:'STRING',enum:[marker]}},required:['marker']};
const reports=[];
const ALLOWED_KEYS=new Set(['success','result','choices','message','content','reasoning','reasoning_content','usage','error','code','errors','response','output','data','id','model','object','created','finish_reason','response_format','refusal','type','metadata','error_code','description','result_info','messages','details','tool_calls']);
function onlyKeys(v){
  if(!v||typeof v!=='object')return[];
  return Object.keys(v).filter(x=>ALLOWED_KEYS.has(x)).slice(0,16);
}
function safeShape(json){
  const payload=json?.result?.choices?json.result:json;
  const msg=payload?.choices?.[0]?.message;
  const content=msg?.content;
  const result=json?.result;
  return{
    rootKeys:onlyKeys(json),
    resultKeys:onlyKeys(result),
    choiceKeys:onlyKeys(payload?.choices?.[0]),
    messageKeys:onlyKeys(msg),
    contentType:Array.isArray(content)?'array':typeof content,
    contentLength:typeof content==='string'?content.length:null,
    contentContainsMarker:typeof content==='string'?content.includes(marker):false,
    reasoningPresent:Boolean(msg?.reasoning_content||msg?.reasoning),
    finishReason:['stop','length','tool_calls','content_filter','eos'].includes(payload?.choices?.[0]?.finish_reason)?payload.choices[0].finish_reason:'OTHER_OR_MISSING',
    payloadContainsMarker:JSON.stringify(json??{}).includes(marker),
    resultSuccess:typeof json?.success==='boolean'?json.success:null
  };
}
for(const provider of selected){
  for(const key of envKeys)delete process.env[key];
  if(provider==='groq')process.env.GROQ_API_KEY=saved.GROQ_API_KEY||'';
  if(provider==='gemini')process.env.GEMINI_API_KEY=saved.GEMINI_API_KEY||'';
  if(provider==='cloudflare'){
    process.env.CLOUDFLARE_AI_API_TOKEN=saved.CLOUDFLARE_AI_API_TOKEN||'';
    process.env.CLOUDFLARE_ACCOUNT_ID=saved.CLOUDFLARE_ACCOUNT_ID||'';
  }
  if(provider==='openrouter'){
    process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
    process.env.OPENROUTER_API_KEY=saved.OPENROUTER_API_KEY||'';
  }
  const info={provider,configured:Boolean(provider==='cloudflare'
    ?process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_AI_API_TOKEN
    :provider==='gemini'?process.env.GEMINI_API_KEY
    :provider==='groq'?process.env.GROQ_API_KEY:process.env.OPENROUTER_API_KEY),
    status:'NOT_RUN',httpStatus:null,routerModel:null,routerError:null,
    schemaValid:false,latencyMs:null,shape:null};
  if(!info.configured){info.status='NOT_CONFIGURED';reports.push(info);continue;}
  globalThis.fetch=async (url,options)=>{
    const response=await originalFetch(url,options);
    const urlText=String(url||'');
    const expected=provider==='groq'?'api.groq.com':provider==='gemini'?'generativelanguage.googleapis.com':provider==='cloudflare'?'api.cloudflare.com':'openrouter.ai';
    if(urlText.includes(expected)){
      info.httpStatus=response.status;
      // Never persist the full response, request, credentials, prompt, or model content.
      if(response.ok){try{info.shape=safeShape(await response.clone().json());}catch{info.shape={jsonReadable:false};}}
    }
    return response;
  };
  const start=Date.now();
  try{
    const result=await routeAiStructured({
      taskType:'workspace_help',prompt:'Synthetic JSON integrity test. Respond with exactly {"marker":"'+marker+'"} and no other words.',
      schema,maxOutputTokens:220,timeoutMs:12000,qualityFallback:false,
      externalDataClass:'public-synthetic'
    });
    info.latencyMs=Date.now()-start;
    info.routerModel=result.model||null;
    info.routerError=/^AI_[A-Z_]+$/.test(result.errorCode||'')?result.errorCode:null;
    info.schemaValid=result.validation?.schema===true&&result.data?.marker===marker;
    info.status=result.success&&info.schemaValid&&result.provider===provider?'PASS':'FAIL';
  }catch(error){info.status=error?.name==='TimeoutError'?'TIMEOUT':'ERROR';info.latencyMs=Date.now()-start;}
  reports.push(info);
  globalThis.fetch=originalFetch;
}
for(const name of envKeys)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];
globalThis.fetch=originalFetch;
mkdirSync('dist',{recursive:true});
const report={audit:'2026-10-17-synthetic-free-routing',scope:'production-keys-synthetic-only',checks:reports,
  withheldFromInference:['mistral','ollama'],dataPolicy:'NO_BUSINESS_DATA'};
writeFileSync('dist/ai-free-inference-audit-20261017.json',JSON.stringify(report,null,2)+'\n',{mode:0o644});
console.log('LOUREX_SYNTHETIC_FREE_INFERENCE_AUDIT_COMPLETE: sanitized status available.');
