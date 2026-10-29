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
