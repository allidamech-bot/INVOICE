import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_FREE_ONLY,AI_MODEL_REGISTRY,geminiSchemaToJsonSchema,routeAiStructured,validateJsonSchema} from '../api/_ai/router.js';

const originalFetch=globalThis.fetch;
const originalEnv={...process.env};
function response(status,payload,headers={}){return{ok:status>=200&&status<300,status,headers:{get:name=>headers[String(name).toLowerCase()]||null},async text(){return typeof payload==='string'?payload:JSON.stringify(payload);}};}
function restore(){globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];for(const [key,value] of Object.entries(originalEnv))process.env[key]=value;}
function schema(){return{type:'OBJECT',properties:{value:{type:'STRING'}},required:['value']};}

test.afterEach(restore);

test('free-only registry contains only the approved provider/model set',()=>{
  assert.equal(AI_FREE_ONLY,true);
  assert.deepEqual(AI_MODEL_REGISTRY.map(entry=>`${entry.provider}:${entry.model}`),[
    'groq:qwen/qwen3.8-27b',
    'groq:openai/gpt-oss-120b',
    'cloudflare:@cf/google/gemma-4-26b-a4b-it',
    'cloudflare:@cf/nvidia/nemotron-3-120b-a12b',
    'cloudflare:@cf/openai/gpt-oss-120b',
    'gemini:gemini-2.5-flash-lite',
  ]);
  assert.ok(AI_MODEL_REGISTRY.every(entry=>entry.freeTierEligible===true));
});

test('Gemini schemas convert to JSON Schema and validate required types',()=>{
  const converted=geminiSchemaToJsonSchema({type:'OBJECT',properties:{name:{type:'STRING'},score:{type:'NUMBER',nullable:true}},required:['name','score']});
  assert.deepEqual(converted,{type:'object',properties:{name:{type:'string'},score:{type:['number','null']}},required:['name','score']});
  assert.equal(validateJsonSchema({name:'A',score:null},converted),true);
  assert.equal(validateJsonSchema({name:'A'},converted),false);
  assert.equal(validateJsonSchema({name:'A',score:'1'},converted),false);
});

test('general requests choose Groq Qwen first',async()=>{
  process.env.GROQ_API_KEY='test-groq';
  process.env.CLOUDFLARE_AI_API_TOKEN='test-cf';
  process.env.CLOUDFLARE_ACCOUNT_ID='acct';
  process.env.GEMINI_API_KEY='test-gemini';
  let seen;
  globalThis.fetch=async(url,options)=>{seen={url:String(url),body:JSON.parse(options.body)};return response(200,{choices:[{message:{content:'{"value":"ok"}'}}]});};
  const result=await routeAiStructured({taskType:'customer_capture',prompt:'extract',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.provider,'groq');assert.equal(result.model,'qwen/qwen3.8-27b');
  assert.match(seen.url,/api\.groq\.com/);assert.equal(seen.body.model,'qwen/qwen3.8-27b');assert.equal(seen.body.reasoning_format,'hidden');
});

test('429 failover moves from Groq to Cloudflare without paid substitution',async()=>{
  process.env.GROQ_API_KEY='test-groq';
  process.env.CLOUDFLARE_AI_API_TOKEN='test-cf';
  process.env.CLOUDFLARE_ACCOUNT_ID='acct';
  process.env.GEMINI_API_KEY='test-gemini';
  const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});if(String(url).includes('api.groq.com'))return response(429,{error:{message:'rate limited'}});return response(200,{choices:[{message:{content:'{"value":"fallback"}'}}]});};
  const result=await routeAiStructured({taskType:'quote_extract',prompt:'extract',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(result.model,'@cf/google/gemma-4-26b-a4b-it');assert.equal(result.fallbackUsed,true);
  assert.equal(calls.length,2);assert.match(calls[1].url,/api\.cloudflare\.com/);assert.equal(calls[1].body.options.rejectIfBusy,true);
});

test('deep reasoning routes to Groq GPT-OSS 120B',async()=>{
  process.env.GROQ_API_KEY='test-groq';
  let body;
  globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);return response(200,{choices:[{message:{content:'{"value":"deep"}'}}]});};
  const result=await routeAiStructured({taskType:'cfo_report',reasoningLevel:'deep',prompt:'analyze',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.model,'openai/gpt-oss-120b');assert.equal(body.reasoning_effort,'medium');
});

test('vision adds data URI input and uses Qwen vision route',async()=>{
  process.env.GROQ_API_KEY='test-groq';
  let body;
  globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);return response(200,{choices:[{message:{content:'{"value":"vision"}'}}]});};
  const result=await routeAiStructured({taskType:'customer_capture',prompt:'read image',attachments:[{kind:'image',mimeType:'image/png',data:'YWJj'}],schema:schema()});
  assert.equal(result.success,true);assert.equal(result.model,'qwen/qwen3.8-27b');
  const image=body.messages[0].content.find(part=>part.type==='image_url');assert.equal(image.image_url.url,'data:image/png;base64,YWJj');
});

test('native PDF route preserves Gemini document handling',async()=>{
  delete process.env.GROQ_API_KEY;delete process.env.CLOUDFLARE_AI_API_TOKEN;delete process.env.CLOUDFLARE_ACCOUNT_ID;process.env.GEMINI_API_KEY='test-gemini';
  let seen;
  globalThis.fetch=async(url,options)=>{seen={url:String(url),body:JSON.parse(options.body)};return response(200,{candidates:[{content:{parts:[{text:'{"value":"pdf"}'}]}}]});};
  const result=await routeAiStructured({taskType:'quote_extract',prompt:'read pdf',attachments:[{kind:'native-document',mimeType:'application/pdf',data:'YWJj'}],schema:schema()});
  assert.equal(result.success,true);assert.equal(result.provider,'gemini');assert.match(seen.url,/generativelanguage\.googleapis\.com/);
  assert.equal(seen.body.contents[0].parts[1].inlineData.mimeType,'application/pdf');
});

test('schema-invalid output falls through to the next approved provider',async()=>{
  process.env.GROQ_API_KEY='test-groq';process.env.CLOUDFLARE_AI_API_TOKEN='test-cf';process.env.CLOUDFLARE_ACCOUNT_ID='acct';
  let calls=0;
  globalThis.fetch=async(url)=>{calls+=1;if(String(url).includes('api.groq.com'))return response(200,{choices:[{message:{content:'{}'}}]});return response(200,{choices:[{message:{content:'{"value":"verified"}'}}]});};
  const result=await routeAiStructured({taskType:'product_mapping',prompt:'map',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(result.fallbackUsed,true);assert.equal(calls,2);
});
