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

test('Cloudflare fallback sends Workers AI JSON Schema directly and current completion token field',async()=>{
  process.env.GROQ_API_KEY='test-groq';
  process.env.CLOUDFLARE_AI_API_TOKEN='test-cloudflare';
  process.env.CLOUDFLARE_ACCOUNT_ID='acct';
  delete process.env.GEMINI_API_KEY;
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    const body=JSON.parse(options.body);
    calls.push({url:String(url),body});
    if(String(url).includes('api.groq.com'))return response(429,{error:{message:'rate limited'}});
    return response(200,{choices:[{message:{content:'{"value":"fallback"}'}}]});
  };

  const result=await routeAiStructured({taskType:'quote_extract',prompt:'extract',schema:schema(),maxOutputTokens:777});

  assert.equal(result.success,true);
  assert.equal(result.provider,'cloudflare');
  assert.equal(result.model,'@cf/google/gemma-4-26b-a4b-it');
  assert.equal(calls.length,2);
  const cloudflare=calls[1].body;
  assert.equal(cloudflare.response_format.type,'json_schema');
  assert.equal(cloudflare.response_format.json_schema.type,'object');
  assert.equal(cloudflare.response_format.json_schema.schema,undefined);
  assert.equal(cloudflare.max_completion_tokens,777);
  assert.equal(cloudflare.max_tokens,undefined);
  assert.equal(cloudflare.options.rejectIfBusy,true);
});
