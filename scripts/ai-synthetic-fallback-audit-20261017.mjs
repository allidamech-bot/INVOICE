/**
 * TEMPORARY QA ONLY: real successes after injected deterministic 429/503 failures.
 * All prompts are synthetic; Mistral/Ollama and financial customer data excluded.
 * Never emit keys, contents, request headers or AI response bodies.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {routeAiStructured} from '../api/_ai/router.js';

const originalFetch=globalThis.fetch;
const originalFlags={
  enabled:process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED,
  mistral:process.env.LOUREX_AI_MISTRAL_FREE_VERIFIED,
  ollama:process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED
};
process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
delete process.env.LOUREX_AI_MISTRAL_FREE_VERIFIED;
delete process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED;
const marker='LOUREX_FALLBACK_20261017';
const schema={type:'OBJECT',properties:{marker:{type:'STRING',enum:[marker]}},required:['marker']};
const cases=[
  {name:'groq_rate_limit_to_cloudflare',block:['api.groq.com'],status:429,expected:'cloudflare'},
  {name:'cloudflare_outage_to_gemini',block:['api.groq.com','api.cloudflare.com'],status:503,expected:'gemini'},
  {name:'all_base_outage_to_free_openrouter',block:['api.groq.com','api.cloudflare.com','generativelanguage.googleapis.com'],status:503,expected:'openrouter'},
];
const results=[];
for(const item of cases){
  const attempts=[];
  globalThis.fetch=(url,options)=>{
    const dest=String(url);
    const provider=dest.includes('api.groq.com')?'groq':dest.includes('api.cloudflare.com')?'cloudflare':dest.includes('generativelanguage.googleapis.com')?'gemini':dest.includes('openrouter.ai')?'openrouter':'unexpected';
    const blocked=item.block.some(domain=>dest.includes(domain));
    attempts.push({provider,simulatedFailure:blocked});
    if(blocked){
      return Promise.resolve(new Response(JSON.stringify({error:{message:'Synthetic injected provider outage'}}),{status:item.status,
        headers:{'Content-Type':'application/json','Retry-After':'60'}}));
    }
    return originalFetch(url,options);
  };
  const start=Date.now();
  const report={scenario:item.name,expected:item.expected,status:'FAIL',provider:null,model:null,
    fallbackUsed:false,schemaValid:false,latencyMs:0,simulatedFailures:[],liveProviders:[],errorCode:null};
  try{
    const response=await routeAiStructured({
      taskType:'workspace_help',externalDataClass:'public-synthetic',reasoningLevel:'standard',
      prompt:'Synthetic fallback JSON test. Reply with exactly {"marker":"'+marker+'"} and nothing else.',
      schema,maxOutputTokens:220,timeoutMs:15000,qualityFallback:false
    });
    report.provider=response.provider||null;
    report.model=response.model||null;
    report.fallbackUsed=response.fallbackUsed===true;
    report.schemaValid=response.data?.marker===marker&&response.validation?.schema===true;
    report.errorCode=/^AI_[A-Z_]+$/.test(response.errorCode||'')?response.errorCode:null;
    report.status=response.success&&report.schemaValid&&report.provider===item.expected&&response.fallbackUsed===true?'PASS':'FAIL';
  }catch{report.status='ERROR';}
  report.latencyMs=Date.now()-start;
  report.simulatedFailures=[...new Set(attempts.filter(x=>x.simulatedFailure).map(x=>x.provider))];
  report.liveProviders=[...new Set(attempts.filter(x=>!x.simulatedFailure).map(x=>x.provider))];
  results.push(report);
}
globalThis.fetch=originalFetch;
for(const [name,key] of [['enabled','LOUREX_AI_NEW_PROVIDERS_ENABLED'],['mistral','LOUREX_AI_MISTRAL_FREE_VERIFIED'],['ollama','LOUREX_AI_OLLAMA_FREE_VERIFIED']]){
  if(originalFlags[name]===undefined)delete process.env[key];else process.env[key]=originalFlags[name];
}
mkdirSync('dist',{recursive:true});
writeFileSync('dist/ai-synthetic-fallback-audit-20261017.json',JSON.stringify({audit:'2026-10-17-live-fallback-after-simulated-outages',checks:results,containsBusinessData:false},null,2)+'\n',{mode:0o644});
console.log('LOUREX_SYNTHETIC_FAILOVER_AUDIT_COMPLETE: status only.');
