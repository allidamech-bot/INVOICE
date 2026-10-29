import test from 'node:test';
import assert from 'node:assert/strict';
const originalFetch=globalThis.fetch,originalEnv={...process.env},originalTimer=globalThis.setTimeout,originalNow=Date.now;
const schema={type:'OBJECT',properties:{answer:{type:'STRING'}},required:['answer']};
let serial=0;
function response(status,provider){return{ok:status===200,status,headers:{get:()=>null},text:async()=>JSON.stringify(provider==='gemini'?{candidates:[{content:{parts:[{text:'{"answer":"ok"}'}]}}]}:provider==='ollama'?{message:{content:'{"answer":"ok"}'}}:{choices:[{message:{content:'{"answer":"ok"}'}}]})};}
function vendor(url){return String(url).includes('groq.com')?'groq':String(url).includes('cloudflare.com')?'cloudflare':String(url).includes('googleapis.com')?'gemini':'ollama';}
async function router(){return import('../api/_ai/router.js?pool='+ ++serial);}
test.beforeEach(()=>Object.assign(process.env,{GROQ_API_KEY:'fixture',CLOUDFLARE_AI_API_TOKEN:'fixture',CLOUDFLARE_ACCOUNT_ID:'fixture',GEMINI_API_KEY:'fixture',OLLAMA_API_KEY:'fixture',LOUREX_AI_NEW_PROVIDERS_ENABLED:'true',LOUREX_AI_OLLAMA_FREE_VERIFIED:'true',LOUREX_AI_APPROVED_PRIVATE_PROVIDERS:'gemini,ollama'}));
test.afterEach(()=>{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;Date.now=originalNow;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);});
test('approved pool survives observed Groq quota and Cloudflare timeout within dialogue budget',async()=>{
 let clock=100000;Date.now=()=>clock;globalThis.setTimeout=(fn,ms)=>originalTimer(()=>{clock+=ms;fn();},0);
 const seen=[],events=[];
 globalThis.fetch=async(url)=>{const p=vendor(url);seen.push(p);if(p==='groq')return response(429,p);if(p==='cloudflare')return new Promise(()=>{});return response(200,p);};
 const r=await (await router()).routeAiStructured({taskType:'business_copilot',prompt:'fictional notebook',schema,totalBudgetMs:26000,timeoutMs:12000,fairBudget:true,onDiagnostic:e=>events.push(e)});
 assert.equal(r.success,true);assert.equal(r.provider,'gemini');assert.deepEqual(seen,['groq','cloudflare','gemini']);assert.ok(r.totalLatencyMs<26000);assert.equal(events[0].category,'rate_limit');assert.equal(events[1].category,'timeout');
});
test('approved Ollama joins text fallback but cannot receive native documents',async()=>{
 const seen=[];globalThis.fetch=async url=>{const p=vendor(url);seen.push(p);return response(p==='ollama'?200:429,p);};
 const r=await (await router()).routeAiStructured({taskType:'business_copilot',schema,prompt:'fixture'});
 assert.equal(r.provider,'ollama');assert.equal(r.success,true);assert.deepEqual(seen,['groq','cloudflare','gemini','ollama']);
 seen.length=0;const pdf=await (await router()).routeAiStructured({taskType:'quote_extract',schema,attachments:[{kind:'native-document',mimeType:'application/pdf',data:'fixture'}]});
 assert.equal(pdf.success,false);assert.deepEqual(seen,['gemini']);
});
test('client-like option cannot approve vendors and missing server approval fails closed',async()=>{
 delete process.env.LOUREX_AI_APPROVED_PRIVATE_PROVIDERS;delete process.env.GROQ_API_KEY;delete process.env.CLOUDFLARE_AI_API_TOKEN;
 let calls=0;globalThis.fetch=async()=>{calls++;return response(200,'gemini');};
 const r=await (await router()).routeAiStructured({taskType:'business_copilot',schema,approvedPrivateProviders:['gemini','ollama']});assert.equal(r.success,false);assert.equal(calls,0);
});
test('Ollama free verification remains mandatory after privacy approval',async()=>{
 delete process.env.GROQ_API_KEY;delete process.env.CLOUDFLARE_AI_API_TOKEN;delete process.env.GEMINI_API_KEY;delete process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED;
 let calls=0;globalThis.fetch=async()=>{calls++;return response(200,'ollama');};
 const r=await (await router()).routeAiStructured({taskType:'business_copilot',schema});assert.equal(r.success,false);assert.equal(calls,0);
});
test('three stalled dialogue providers leave a real window for fourth vendor',async()=>{
 let clock=200000;Date.now=()=>clock;globalThis.setTimeout=(fn,ms)=>originalTimer(()=>{clock+=ms;fn();},0);
 const seen=[],events=[];globalThis.fetch=async url=>{const p=vendor(url);seen.push(p);return p==='ollama'?response(200,p):new Promise(()=>{});};
 const r=await (await router()).routeAiStructured({taskType:'business_copilot',schema,prompt:'fictional',totalBudgetMs:26000,timeoutMs:12000,fairBudget:true,onDiagnostic:e=>events.push(e)});
 assert.equal(r.success,true);assert.deepEqual(seen,['groq','cloudflare','gemini','ollama']);assert.ok(r.totalLatencyMs<26000);assert.ok(events.slice(0,3).every(e=>e.category==='timeout'&&e.latencyMs<12000));
});
test('approved Gemini accepts native PDF; text-only Ollama is never an upload fallback',async()=>{
 const seen=[];globalThis.fetch=async url=>{seen.push(vendor(url));return response(200,'gemini');};
 const r=await (await router()).routeAiStructured({taskType:'quote_extract',schema,attachments:[{kind:'native-document',mimeType:'application/pdf',data:'fixture'}]});
 assert.equal(r.success,true);assert.equal(r.provider,'gemini');assert.deepEqual(seen,['gemini']);
});
test('model-specific Groq quota can hand off to another Groq model',async()=>{
 process.env.LOUREX_AI_MULTI_MODEL_ENABLED='true';delete process.env.OPENROUTER_API_KEY;
 const models=[];globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);models.push(body.model);
  if(body.model==='openai/gpt-oss-120b')return{ok:false,status:429,headers:{get:()=>null},text:async()=>JSON.stringify({error:{message:'Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute'}})};
  return response(200,vendor(url));};
 const r=await (await router()).routeAiStructured({taskType:'business_copilot',schema});assert.equal(r.success,true);assert.equal(r.provider,'groq');assert.equal(r.model,'openai/gpt-oss-20b');assert.deepEqual(models,['openai/gpt-oss-120b','openai/gpt-oss-20b']);
});
test('unknown account quota skips every model of the vendor, not one key per model',async()=>{
 process.env.LOUREX_AI_MULTI_MODEL_ENABLED='true';delete process.env.OPENROUTER_API_KEY;const seen=[];
 globalThis.fetch=async(url,options)=>{seen.push(vendor(url));return response(vendor(url)==='groq'?429:200,vendor(url));};
 const r=await (await router()).routeAiStructured({taskType:'business_copilot',schema});assert.equal(r.provider,'cloudflare');assert.deepEqual(seen,['groq','cloudflare']);
});
test('OpenRouter discovers all zero-price free text variants and enforces zero price at inference',async()=>{
 process.env.LOUREX_AI_MULTI_MODEL_ENABLED='true';process.env.OPENROUTER_API_KEY='fixture';process.env.LOUREX_AI_APPROVED_PRIVATE_PROVIDERS='openrouter';
 delete process.env.GROQ_API_KEY;delete process.env.CLOUDFLARE_AI_API_TOKEN;delete process.env.GEMINI_API_KEY;delete process.env.OLLAMA_API_KEY;
 const seen=[];globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('/models'))return{ok:true,text:async()=>JSON.stringify({data:[{id:'fixture/one:free',pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['text']}},{id:'fixture/two:free',pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['text']}}]})};
  const body=JSON.parse(options.body);seen.push(body.model);assert.deepEqual(body.provider.max_price,{prompt:0,completion:0});
  return response(body.model==='fixture/two:free'?200:404,'openrouter');
 };
 const r=await (await router()).routeAiStructured({taskType:'business_copilot',schema});assert.equal(r.success,true);assert.equal(r.model,'fixture/two:free');assert.deepEqual(seen,['openrouter/free','fixture/one:free','fixture/two:free']);
});
test('multi-model mode does not treat the old Ollama free flag as current zero-cost proof',async()=>{
 process.env.LOUREX_AI_MULTI_MODEL_ENABLED='true';delete process.env.LOUREX_AI_OLLAMA_ZERO_COST_MODELS;
 delete process.env.GROQ_API_KEY;delete process.env.CLOUDFLARE_AI_API_TOKEN;delete process.env.GEMINI_API_KEY;delete process.env.OPENROUTER_API_KEY;
 let calls=0;globalThis.fetch=async()=>{calls++;return response(200,'ollama');};
 const r=await (await router()).routeAiStructured({taskType:'business_copilot',schema});assert.equal(r.success,false);assert.equal(calls,0);
});

test('large OpenRouter catalog does not starve first attempt of a normal response window',async()=>{
 process.env.LOUREX_AI_MULTI_MODEL_ENABLED='true';process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
 process.env.LOUREX_AI_APPROVED_PRIVATE_PROVIDERS='openrouter';
 process.env.OPENROUTER_API_KEY='fixture';delete process.env.OLLAMA_API_KEY;
 const deadlines=[];
 globalThis.setTimeout=(fn,ms,...args)=>{deadlines.push(ms);return originalTimer(fn,ms,...args);};
 globalThis.fetch=async url=>{
   if(String(url).endsWith('/models'))return {ok:true,text:async()=>JSON.stringify({data:Array.from({length:60},(_,i)=>({id:'fixture/free-'+i+':free',pricing:{prompt:'0',completion:'0'},architecture:{input_modalities:['text'],output_modalities:['text']}}))})};
   if(vendor(url)==='groq')return response(200,'groq');
   throw Error('Unexpected provider');
 };
 const result=await (await router()).routeAiStructured({taskType:'business_copilot',schema,prompt:'fictional',
   totalBudgetMs:26000,timeoutMs:12000,fairBudget:true});
 assert.equal(result.success,true);
 assert.equal(result.provider,'groq');
 assert.ok(deadlines.some(ms=>ms>=5300&&ms<=12000),'provider deadline must not collapse to 3s when free catalog grows');
});
