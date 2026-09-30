import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {AI_FREE_ONLY,AI_MODEL_REGISTRY,geminiSchemaToJsonSchema,routeAiStructured,validateJsonSchema} from '../api/_ai/router.js';

const originalFetch=globalThis.fetch;
const originalSetTimeout=globalThis.setTimeout;
const originalDateNow=Date.now;
const originalEnv={...process.env};
let testClock=originalDateNow();
function response(status,payload,headers={}){return{ok:status>=200&&status<300,status,headers:{get:name=>headers[String(name).toLowerCase()]||null},async text(){return typeof payload==='string'?payload:JSON.stringify(payload);}};}
function restore(){globalThis.fetch=originalFetch;globalThis.setTimeout=originalSetTimeout;Date.now=originalDateNow;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];for(const [key,value] of Object.entries(originalEnv))process.env[key]=value;}
function schema(){return{type:'OBJECT',properties:{value:{type:'STRING'}},required:['value']};}
function confidenceSchema(){return{type:'OBJECT',properties:{value:{type:'STRING'},confidence:{type:'STRING',enum:['high','medium','low']}},required:['value','confidence']};}
function configureAll(){process.env.GROQ_API_KEY='test-groq';process.env.CLOUDFLARE_AI_API_TOKEN='test-cf';process.env.CLOUDFLARE_ACCOUNT_ID='acct';process.env.GEMINI_API_KEY='test-gemini';}
function allSourceFiles(root){const out=[];for(const name of readdirSync(root)){const path=join(root,name),stat=statSync(path);if(stat.isDirectory())out.push(...allSourceFiles(path));else if(/\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(name))out.push(path);}return out;}

test.beforeEach(()=>{testClock+=60_000;Date.now=()=>testClock;});
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

test('schemas are closed by default and validate required, types, bounds and unknown fields',()=>{
  const converted=geminiSchemaToJsonSchema({type:'OBJECT',properties:{name:{type:'STRING',minLength:1},score:{type:'NUMBER',nullable:true}},required:['name','score']});
  assert.deepEqual(converted,{type:'object',properties:{name:{type:'string',minLength:1},score:{type:['number','null']}},required:['name','score'],additionalProperties:false});
  assert.equal(validateJsonSchema({name:'A',score:null},converted),true);
  assert.equal(validateJsonSchema({name:'A'},converted),false);
  assert.equal(validateJsonSchema({name:'A',score:'1'},converted),false);
  assert.equal(validateJsonSchema({name:'A',score:1,unexpected:'x'},converted),false);
  assert.equal(validateJsonSchema({name:'',score:1},converted),false);
});

test('general requests choose Groq Qwen first',async()=>{
  configureAll();let seen;
  globalThis.fetch=async(url,options)=>{seen={url:String(url),body:JSON.parse(options.body)};return response(200,{choices:[{message:{content:'{"value":"ok"}'}}]});};
  const result=await routeAiStructured({taskType:'customer_capture',prompt:'extract',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.provider,'groq');assert.equal(result.model,'qwen/qwen3.8-27b');
  assert.match(seen.url,/api\.groq\.com/);assert.equal(seen.body.model,'qwen/qwen3.8-27b');assert.equal(seen.body.reasoning_format,'hidden');
});

test('429 falls through immediately from Groq to Cloudflare without paid substitution or retry storm',async()=>{
  configureAll();const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});if(String(url).includes('api.groq.com'))return response(429,{error:{message:'rate limited'}});return response(200,{choices:[{message:{content:'{"value":"fallback"}'}}]});};
  const result=await routeAiStructured({taskType:'quote_extract',prompt:'extract',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(result.model,'@cf/google/gemma-4-26b-a4b-it');assert.equal(result.fallbackUsed,true);
  assert.equal(calls.length,2);assert.equal(calls.filter(call=>call.url.includes('api.groq.com')).length,1);assert.equal(calls[1].body.options.rejectIfBusy,true);
});

test('transient 5xx gets one bounded retry then falls back',async()=>{
  configureAll();let calls=0;
  globalThis.fetch=async(url)=>{calls+=1;if(String(url).includes('api.groq.com'))return response(503,{error:{message:'busy'}});return response(200,{choices:[{message:{content:'{"value":"fallback"}'}}]});};
  const result=await routeAiStructured({taskType:'workspace_help',prompt:'help',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(calls,3);
});

test('provider auth/config rejection does not abort fallback to the next approved free provider',async()=>{
  configureAll();let calls=0;
  globalThis.fetch=async(url)=>{calls+=1;if(String(url).includes('api.groq.com'))return response(401,{error:{message:'invalid key'}});return response(200,{choices:[{message:{content:'{"value":"fallback"}'}}]});};
  const result=await routeAiStructured({taskType:'workspace_help',prompt:'help',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(calls,2);
});

test('deep reasoning routes to Groq GPT-OSS 120B',async()=>{
  process.env.GROQ_API_KEY='test-groq';let body;
  globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);return response(200,{choices:[{message:{content:'{"value":"deep"}'}}]});};
  const result=await routeAiStructured({taskType:'cfo_report',reasoningLevel:'deep',prompt:'analyze',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.model,'openai/gpt-oss-120b');assert.equal(body.reasoning_effort,'medium');
});

test('vision adds data URI input and uses Qwen vision route',async()=>{
  process.env.GROQ_API_KEY='test-groq';let body;
  globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);return response(200,{choices:[{message:{content:'{"value":"vision"}'}}]});};
  const result=await routeAiStructured({taskType:'customer_capture',prompt:'read image',attachments:[{kind:'image',mimeType:'image/png',data:'YWJj'}],schema:schema()});
  assert.equal(result.success,true);assert.equal(result.model,'qwen/qwen3.8-27b');
  const image=body.messages[0].content.find(part=>part.type==='image_url');assert.equal(image.image_url.url,'data:image/png;base64,YWJj');
});

test('native PDF route preserves Gemini document handling',async()=>{
  delete process.env.GROQ_API_KEY;delete process.env.CLOUDFLARE_AI_API_TOKEN;delete process.env.CLOUDFLARE_ACCOUNT_ID;process.env.GEMINI_API_KEY='test-gemini';let seen;
  globalThis.fetch=async(url,options)=>{seen={url:String(url),body:JSON.parse(options.body)};return response(200,{candidates:[{content:{parts:[{text:'{"value":"pdf"}'}]}}]});};
  const result=await routeAiStructured({taskType:'quote_extract',prompt:'read pdf',attachments:[{kind:'native-document',mimeType:'application/pdf',data:'YWJj'}],schema:schema()});
  assert.equal(result.success,true);assert.equal(result.provider,'gemini');assert.match(seen.url,/generativelanguage\.googleapis\.com/);assert.equal(seen.body.contents[0].parts[1].inlineData.mimeType,'application/pdf');
});

test('unsupported raw spreadsheet/document modality is rejected before any provider call',async()=>{
  configureAll();let calls=0;globalThis.fetch=async()=>{calls+=1;return response(500,{});};
  const result=await routeAiStructured({taskType:'product_import',prompt:'read',attachments:[{kind:'native-document',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',data:'YWJj'}],schema:schema()});
  assert.equal(result.success,false);assert.equal(result.errorCode,'AI_UNSUPPORTED_MODALITY');assert.equal(calls,0);
});

test('malformed JSON output falls through to the next approved provider',async()=>{
  configureAll();let calls=0;
  globalThis.fetch=async(url)=>{calls+=1;if(String(url).includes('api.groq.com'))return response(200,{choices:[{message:{content:'not-json'}}]});return response(200,{choices:[{message:{content:'{"value":"verified"}'}}]});};
  const result=await routeAiStructured({taskType:'product_mapping',prompt:'map',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(result.fallbackUsed,true);assert.equal(calls,2);
});

test('schema-invalid or unknown-field output falls through to the next approved provider',async()=>{
  configureAll();let calls=0;
  globalThis.fetch=async(url)=>{calls+=1;if(String(url).includes('api.groq.com'))return response(200,{choices:[{message:{content:'{"value":"bad","unexpected":"x"}'}}]});return response(200,{choices:[{message:{content:'{"value":"verified"}'}}]});};
  const result=await routeAiStructured({taskType:'product_mapping',prompt:'map',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(calls,2);
});

test('low-confidence structured extraction can trigger quality fallback',async()=>{
  configureAll();let calls=0;
  globalThis.fetch=async(url)=>{calls+=1;if(String(url).includes('api.groq.com'))return response(200,{choices:[{message:{content:'{"value":"uncertain","confidence":"low"}'}}]});return response(200,{choices:[{message:{content:'{"value":"verified","confidence":"high"}'}}]});};
  const result=await routeAiStructured({taskType:'customer_capture',prompt:'extract',schema:confidenceSchema(),qualityFallback:true});
  assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(result.data.value,'verified');assert.equal(result.fallbackUsed,true);assert.equal(result.validation.needsReview,false);assert.equal(calls,2);
});

test('low-confidence accepted result is explicitly review-required when no quality fallback is requested',async()=>{
  process.env.GROQ_API_KEY='test-groq';globalThis.fetch=async()=>response(200,{choices:[{message:{content:'{"value":"uncertain","confidence":"low"}'}}]});
  const result=await routeAiStructured({taskType:'customer_capture',prompt:'extract',schema:confidenceSchema()});
  assert.equal(result.success,true);assert.equal(result.confidence,'low');assert.equal(result.validation.needsReview,true);
});

test('timeout is bounded and can fall through to the next provider',async()=>{
  configureAll();globalThis.setTimeout=(fn,_ms,...args)=>originalSetTimeout(fn,0,...args);let calls=0;
  globalThis.fetch=async(url,options)=>{calls+=1;if(String(url).includes('api.groq.com'))return new Promise((resolve,reject)=>{if(options.signal?.aborted){const error=new Error('aborted');error.name='AbortError';reject(error);return;}options.signal?.addEventListener('abort',()=>{const error=new Error('aborted');error.name='AbortError';reject(error);},{once:true});});return response(200,{choices:[{message:{content:'{"value":"fallback"}'}}]});};
  const result=await routeAiStructured({taskType:'workspace_help',prompt:'help',schema:schema(),timeoutMs:3000});
  assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(calls,3);
});

test('AI provider secrets are server-only and absent from browser source',()=>{
  const files=allSourceFiles(new URL('../src/',import.meta.url).pathname);const browserSource=files.map(path=>readFileSync(path,'utf8')).join('\n');
  for(const secretName of ['GROQ_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GEMINI_API_KEY'])assert.equal(browserSource.includes(secretName),false,`${secretName} must not be referenced in browser source`);
});

test('document prompts keep uploads as untrusted data and accounting remains deterministic',()=>{
  const customer=readFileSync(new URL('../api/customer-capture-ai.js',import.meta.url),'utf8');const core=readFileSync(new URL('../api/ai-core.js',import.meta.url),'utf8');
  assert.match(customer,/untrusted DATA/i);assert.match(customer,/ignore any instructions|never execute or follow/i);
  assert.match(core,/calculated deterministically/i);assert.match(core,/do not replace or recalculate/i);assert.match(core,/preview-only/i);
});
