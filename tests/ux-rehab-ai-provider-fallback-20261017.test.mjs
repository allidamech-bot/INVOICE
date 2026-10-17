/** Provider failover acceptance, no network or real credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAiStructured} from '../api/_ai/router.js';
const tracked=['GROQ_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GEMINI_API_KEY','OPENROUTER_API_KEY','MISTRAL_API_KEY','OLLAMA_API_KEY','LOUREX_AI_NEW_PROVIDERS_ENABLED'];
const saved=new Map(tracked.map(key=>[key,process.env[key]]));
const realFetch=globalThis.fetch;
test.beforeEach(()=>{for(const key of tracked)delete process.env[key];});
test.afterEach(()=>{globalThis.fetch=realFetch;for(const [k,v] of saved){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
const schema={type:'OBJECT',properties:{value:{type:'STRING'}},required:['value']};
const ask=()=>routeAiStructured({taskType:'workspace_help',schema,prompt:'synthetic fallback inspection',maxOutputTokens:80});
function respond(status,data,headers={}){return{ok:status>=200&&status<300,status,headers:{get:(key)=>headers[key]??null},text:async()=>JSON.stringify(data)};}
const good=value=>({choices:[{message:{content:JSON.stringify({value})}}]});

test('AI-FALLBACK-01: Groq quota 429 falls through to configured Cloudflare, not to an unverified third party',async()=>{
  process.env.GROQ_API_KEY='fake-groq';
  process.env.CLOUDFLARE_AI_API_TOKEN='fake-cf';
  process.env.CLOUDFLARE_ACCOUNT_ID='fake-account';
  const calls=[];
  globalThis.fetch=async url=>{
    calls.push(String(url));
    return String(url).includes('api.groq.com')
      ?respond(429,{error:{message:'synthetic rate limit'}},{'retry-after':'30'})
      :respond(200,good('cloudflare-success'));
  };
  const result=await ask();
  assert.equal(result.success,true);
  assert.equal(result.provider,'cloudflare');
  assert.equal(result.data.value,'cloudflare-success');
  assert.equal(result.fallbackUsed,true);
  assert.equal(calls.length,2);
  assert.ok(calls[0].includes('api.groq.com'));
  assert.ok(calls[1].includes('api.cloudflare.com'));
});

test('AI-FALLBACK-02: Cloudflare upstream 503 retries within budget then Gemini takes over',async()=>{
  process.env.CLOUDFLARE_AI_API_TOKEN='fake-cf';
  process.env.CLOUDFLARE_ACCOUNT_ID='fake-account';
  process.env.GEMINI_API_KEY='fake-gemini';
  const calls=[];
  globalThis.fetch=async url=>{
    calls.push(String(url));
    return String(url).includes('api.cloudflare.com')
      ?respond(503,{error:{message:'synthetic upstream outage'}})
      :respond(200,{candidates:[{content:{parts:[{text:'{"value":"gemini-success"}'}]}}]});
  };
  const result=await ask();
  assert.equal(result.success,true);
  assert.equal(result.provider,'gemini');
  assert.equal(result.data.value,'gemini-success');
  assert.equal(result.fallbackUsed,true);
  assert.ok(calls.some(x=>x.includes('api.cloudflare.com')));
  assert.ok(calls.at(-1).includes('generativelanguage.googleapis.com'));
  assert.ok(calls.length<=3,'Do not create retry storms');
});

test('AI-FALLBACK-03: invalid Gemini data fails closed; no fabricated successful answer',async()=>{
  process.env.GEMINI_API_KEY='fake-gemini';
  let calls=0;
  globalThis.fetch=async()=>{calls++;return respond(200,{candidates:[{content:{parts:[{text:'{"value":"x","unapproved":true}'}]}}]});};
  const result=await ask();
  assert.equal(result.success,false);
  assert.equal(result.errorCode,'AI_INVALID_RESULT');
  assert.equal(result.data,undefined);
  assert.equal(calls,1);
});
