/** Provider failover acceptance, no network or real credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
let routeAiStructured,instance=0;
const tracked=['GROQ_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GEMINI_API_KEY','OPENROUTER_API_KEY','MISTRAL_API_KEY','OLLAMA_API_KEY','LOUREX_AI_NEW_PROVIDERS_ENABLED'];
const saved=new Map(tracked.map(key=>[key,process.env[key]]));
const realFetch=globalThis.fetch;
test.beforeEach(async()=>{({routeAiStructured}=await import('../api/_ai/router.js?pruned-ux='+ ++instance));for(const key of tracked)delete process.env[key];});
test.afterEach(()=>{globalThis.fetch=realFetch;for(const [k,v] of saved){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
const schema={type:'OBJECT',properties:{value:{type:'STRING'}},required:['value']};
const ask=()=>routeAiStructured({taskType:'workspace_help',schema,prompt:'synthetic fallback inspection',maxOutputTokens:80});
function respond(status,data,headers={}){return{ok:status>=200&&status<300,status,headers:{get:(key)=>headers[key]??null},text:async()=>JSON.stringify(data)};}
const good=value=>({choices:[{message:{content:JSON.stringify({value})}}]});

test('AI-FALLBACK-01: Groq quota never sends private text to a removed vendor',async()=>{
 process.env.GROQ_API_KEY='fake-groq';process.env.CLOUDFLARE_AI_API_TOKEN='retired';process.env.CLOUDFLARE_ACCOUNT_ID='retired';
 const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return respond(429,{});};
 const r=await ask();assert.equal(r.success,false);assert.equal(r.errorCode,'AI_RATE_LIMITED');assert.equal(calls.length,1);assert.ok(calls[0].includes('groq.com'));
});
test('AI-FALLBACK-02: retired keys do not configure a fallback',async()=>{
 process.env.CLOUDFLARE_AI_API_TOKEN='retired';process.env.CLOUDFLARE_ACCOUNT_ID='retired';process.env.GEMINI_API_KEY='retired';let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('No retired egress');};const r=await ask();assert.equal(r.success,false);assert.equal(calls,0);
});
test('AI-FALLBACK-03: invalid retained output is rejected',async()=>{
 process.env.GROQ_API_KEY='fake-groq';let calls=0;globalThis.fetch=async()=>{calls++;return respond(200,{choices:[{message:{content:'{"value":"x","unapproved":true}'}}]});};
 const r=await ask();assert.equal(r.success,false);assert.equal(r.errorCode,'AI_INVALID_RESULT');assert.equal(calls,1);
});
