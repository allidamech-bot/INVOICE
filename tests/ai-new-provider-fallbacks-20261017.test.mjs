import test from 'node:test';
import assert from 'node:assert/strict';
let routeAiStructured,routerInstance=0;

const originalEnv={...process.env};
const originalFetch=globalThis.fetch;
const keyNames=['GROQ_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GEMINI_API_KEY','OPENROUTER_API_KEY','MISTRAL_API_KEY','OLLAMA_API_KEY','LOUREX_AI_NEW_PROVIDERS_ENABLED','LOUREX_AI_MISTRAL_FREE_VERIFIED','LOUREX_AI_OLLAMA_FREE_VERIFIED'];

test.beforeEach(async()=>{
  ({routeAiStructured}=await import('../api/_ai/router.js?external-test='+ ++routerInstance));
  for(const name of keyNames)delete process.env[name];
});
test.afterEach(()=>{
  globalThis.fetch=originalFetch;
  for(const name of keyNames){
    if(Object.hasOwn(originalEnv,name))process.env[name]=originalEnv[name];
    else delete process.env[name];
  }
});

const schema={type:'OBJECT',properties:{value:{type:'STRING'}},required:['value']};
const ask=()=>routeAiStructured({taskType:'workspace_help',prompt:'synthetic only',schema,maxOutputTokens:80,externalDataClass:'public-synthetic'});
function response(status,body){
  return{ok:status>=200&&status<300,status,headers:{get:()=>null},text:async()=>JSON.stringify(body)};
}

test('Groq-only isolation rejects all optional and retired provider credentials',async()=>{
 Object.assign(process.env,{OLLAMA_API_KEY:'fake-key',OPENROUTER_API_KEY:'fake-key',LOUREX_AI_NEW_PROVIDERS_ENABLED:'true',LOUREX_AI_OLLAMA_FREE_VERIFIED:'true'});
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No optional provider');};
 const r=await ask();assert.equal(r.success,false);assert.equal(calls,0);
});
test('failed Groq has no provider fallback even for public synthetic input',async()=>{
 Object.assign(process.env,{GROQ_API_KEY:'fake-key',OLLAMA_API_KEY:'fake-key',LOUREX_AI_NEW_PROVIDERS_ENABLED:'true',LOUREX_AI_OLLAMA_FREE_VERIFIED:'true'});
 const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return response(429,{});};
 const r=await ask();assert.equal(r.success,false);assert.equal(calls.length,1);assert.ok(calls[0].includes('groq.com'));
});
