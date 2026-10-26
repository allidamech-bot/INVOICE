import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAiStructured} from '../api/_ai/router.js';

const originalFetch=globalThis.fetch;
const originalEnv={...process.env};

function response(status,payload){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get:()=>null},
    async text(){return JSON.stringify(payload);},
  };
}

function schema(){
  return {type:'OBJECT',properties:{value:{type:'STRING'}},required:['value']};
}

function restore(){
  globalThis.fetch=originalFetch;
  for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
  for(const [key,value] of Object.entries(originalEnv))process.env[key]=value;
}

test.afterEach(restore);

test('Groq GPT-OSS deep route uses include_reasoning instead of unsupported reasoning_format',async()=>{
  process.env.GROQ_API_KEY='test-groq';
  delete process.env.CLOUDFLARE_AI_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.GEMINI_API_KEY;
  let body;
  globalThis.fetch=async(_url,options)=>{
    body=JSON.parse(options.body);
    return response(200,{choices:[{message:{content:'{"value":"deep"}'}}]});
  };

  const result=await routeAiStructured({taskType:'cfo_report',reasoningLevel:'deep',prompt:'analyze',schema:schema()});

  assert.equal(result.success,true);
  assert.equal(result.provider,'groq');
  assert.equal(result.model,'openai/gpt-oss-120b');
  assert.equal(body.reasoning_effort,'medium');
  assert.equal(body.include_reasoning,false);
  assert.equal(body.reasoning_format,undefined);
});

test('removed fallback cannot receive a request when Groq rejects',async()=>{
 process.env.GROQ_API_KEY='test-groq';process.env.CLOUDFLARE_AI_API_TOKEN='retired';process.env.CLOUDFLARE_ACCOUNT_ID='retired';
 let calls=0;globalThis.fetch=async url=>{calls++;assert.match(String(url),/groq.com/);return response(429,{});};
 const result=await routeAiStructured({taskType:'quote_extract',prompt:'Synthetic',schema:schema()});
 assert.equal(result.success,false);assert.equal(calls,1);
});
