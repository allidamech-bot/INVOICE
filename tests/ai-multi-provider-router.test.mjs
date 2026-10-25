import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {AI_FREE_ONLY,AI_MODEL_REGISTRY,geminiSchemaToJsonSchema,validateJsonSchema} from '../api/_ai/router.js';

const originalFetch=globalThis.fetch;
const originalSetTimeout=globalThis.setTimeout;
const originalDateNow=Date.now;
const originalEnv={...process.env};
let testClock=originalDateNow();
let routeAiStructured,routerInstance=0;
function response(status,payload,headers={}){return{ok:status>=200&&status<300,status,headers:{get:name=>headers[String(name).toLowerCase()]||null},async text(){return typeof payload==='string'?payload:JSON.stringify(payload);}};}
function restore(){globalThis.fetch=originalFetch;globalThis.setTimeout=originalSetTimeout;Date.now=originalDateNow;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];for(const [key,value] of Object.entries(originalEnv))process.env[key]=value;}
function schema(){return{type:'OBJECT',properties:{value:{type:'STRING'}},required:['value']};}
function confidenceSchema(){return{type:'OBJECT',properties:{value:{type:'STRING'},confidence:{type:'STRING',enum:['high','medium','low']}},required:['value','confidence']};}
function configureAll(){process.env.GROQ_API_KEY='test-groq';process.env.CLOUDFLARE_AI_API_TOKEN='test-cf';process.env.CLOUDFLARE_ACCOUNT_ID='acct';process.env.GEMINI_API_KEY='test-gemini';}
function allSourceFiles(root){const out=[];for(const name of readdirSync(root)){const path=join(root,name),stat=statSync(path);if(stat.isDirectory())out.push(...allSourceFiles(path));else if(/\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(name))out.push(path);}return out;}

test.beforeEach(async()=>{testClock+=60_000;Date.now=()=>testClock;({routeAiStructured}=await import('../api/_ai/router.js?test='+ ++routerInstance));});
test.afterEach(restore);

test('explicit diagnostic listener receives bounded attempt metadata without request contents or keys',async()=>{
 configureAll();const events=[];
 globalThis.fetch=async url=>String(url).includes('groq.com')?response(400,{error:{message:'unsupported response_format PRIVATE-UPSTREAM'}}):response(200,{choices:[{message:{content:'{"value":"ok"}'}}]});
 const result=await routeAiStructured({taskType:'business_copilot',prompt:'PRIVATE-PROMPT',schema:schema(),onDiagnostic:event=>events.push(event)});
 assert.equal(result.success,true);assert.equal(events.length,2);
 assert.equal(events[0].provider,'groq');assert.equal(events[0].category,'unsupported');
 assert.equal(events[1].provider,'cloudflare');assert.equal(events[1].status,'ok');
 assert.doesNotMatch(JSON.stringify(events),/PRIVATE|test-groq|test-cf/);
});

test('free-only registry contains only the approved provider/model set',()=>{
  assert.equal(AI_FREE_ONLY,true);
  assert.deepEqual(AI_MODEL_REGISTRY.map(entry=>`${entry.provider}:${entry.model}`),[
    'groq:qwen/qwen3.8-27b',
    'groq:openai/gpt-oss-120b',
    'cloudflare:@cf/google/gemma-4-26b-a4b-it',
    'cloudflare:@cf/nvidia/nemotron-3-120b-a12b',
    'cloudflare:@cf/openai/gpt-oss-120b',
    'gemini:gemini-2.5-flash-lite',
    'openrouter:openrouter/free',
    'ollama:gemma4:31b',
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
  assert.match(seen.url,/api\.groq\.com/);assert.equal(seen.body.model,'qwen/qwen3.8-27b');assert.equal(seen.body.reasoning_format,'hidden');assert.equal(seen.body.response_format.json_schema.strict,false);
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

test('timeout is bounded and falls through immediately to the next provider',async()=>{
  configureAll();globalThis.setTimeout=(fn,_ms,...args)=>originalSetTimeout(fn,0,...args);let calls=0;
  globalThis.fetch=async(url,options)=>{calls+=1;if(String(url).includes('api.groq.com'))return new Promise((resolve,reject)=>{if(options.signal?.aborted){const error=new Error('aborted');error.name='AbortError';reject(error);return;}options.signal?.addEventListener('abort',()=>{const error=new Error('aborted');error.name='AbortError';reject(error);},{once:true});});return response(200,{choices:[{message:{content:'{"value":"fallback"}'}}]});};
  const result=await routeAiStructured({taskType:'workspace_help',prompt:'help',schema:schema(),timeoutMs:3000});
  assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(calls,2);
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


test('free-provider fallback respects a total deadline shorter than the 60s browser timeout',async()=>{
  configureAll();
  let clock=Date.now(),requests=0;
  Date.now=()=>clock;
  globalThis.fetch=async()=>{
    requests+=1;
    clock+=49_500;
    return response(503,{error:{message:'upstream unavailable'}});
  };
  const result=await routeAiStructured({taskType:'workspace_help',prompt:'help',schema:schema()});
  assert.equal(result.success,false);
  assert.equal(result.errorCode,'AI_TIMEOUT');
  assert.equal(requests,1,'after consuming the deadline no later provider or retry may start');
  // The router circuit breaker uses Date.now. Advance the shared fake clock
  // past this test's simulated 49.5-second provider latency before the next case.
  testClock=clock;
});

test('provider response body that never settles is hard-timed-out, not left spinning indefinitely',async()=>{
  delete process.env.CLOUDFLARE_AI_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.GEMINI_API_KEY;
  process.env.GROQ_API_KEY='test-groq';
  globalThis.setTimeout=(callback,_delay,...args)=>originalSetTimeout(callback,0,...args);
  let calls=0;
  globalThis.fetch=async()=>{
    calls+=1;
    return{ok:true,status:200,headers:{get:()=>null},text:()=>new Promise(()=>{})};
  };
  const result=await routeAiStructured({taskType:'workspace_help',prompt:'help',schema:schema(),timeoutMs:3_000});
  assert.equal(result.success,false);
  assert.equal(result.errorCode,'AI_TIMEOUT');
  assert.equal(calls,1);
});


test('browser AI request maps provider failures to bilingual retry guidance',()=>{
  const source=readFileSync(new URL('../src/lib/ai-request.ts',import.meta.url),'utf8');
  assert.match(source,/timeoutMs=60_000/);
  for(const code of ['AI_RATE_LIMITED','AI_TIMEOUT','AI_NOT_CONFIGURED','AI_TEMPORARILY_UNAVAILABLE'])
    assert.ok(source.includes(code),code+' must have an explicit user-facing message');
  assert.match(source,/مزوّدو الذكاء الاصطناعي مشغولون مؤقتًا/);
  assert.match(source,/استغرق رد الذكاء الاصطناعي وقتًا أطول/);
  assert.match(source,/تحتاج جلسة حساب Firebase إلى التحديث/);
  assert.match(source,/new AiRequestError\(aiPublicErrorMessage\(code,response.status/);
});

test('supplier extraction requests strict JSON without bypassing schema or source validation',async()=>{
  process.env.GROQ_API_KEY='test-groq';
  delete process.env.CLOUDFLARE_AI_API_TOKEN;delete process.env.CLOUDFLARE_ACCOUNT_ID;delete process.env.GEMINI_API_KEY;
  const purchaseSchema={type:'OBJECT',properties:{items:{type:'ARRAY',items:{type:'OBJECT',properties:{sku:{type:'STRING'},quantity:{type:'STRING'},unitCost:{type:'STRING'}},required:['sku','quantity','unitCost']}}},required:['items']};
  let body,payload={items:[{sku:'QA-01',quantity:'10',unitCost:'1.00'}]};
  globalThis.fetch=async(_url,options)=>{body=JSON.parse(options.body);return response(200,{choices:[{message:{content:JSON.stringify(payload)}}]});};
  const request={taskType:'supplier_purchase_extract',prompt:'Extract QA-01 only',schema:purchaseSchema};
  const accepted=await routeAiStructured(request);
  assert.equal(accepted.success,true);
  assert.equal(body.response_format.json_schema.strict,true);
  assert.equal(body.response_format.json_schema.schema.additionalProperties,false);
  assert.equal(body.response_format.json_schema.schema.properties.items.items.additionalProperties,false);
  assert.deepEqual(body.response_format.json_schema.schema.properties.items.items.required,['sku','quantity','unitCost']);
  payload={items:[{sku:'QA-01',quantity:10,unitCost:'1.00'}]};
  const malformed=await routeAiStructured(request);
  assert.equal(malformed.success,false);assert.equal(malformed.errorCode,'AI_INVALID_RESULT');
  payload={items:[{sku:'QA-01',quantity:'10',unitCost:'1.00'}]};
  const ungrounded=await routeAiStructured({...request,validate:()=>false});
  assert.equal(ungrounded.success,false);assert.equal(ungrounded.errorCode,'AI_INVALID_RESULT');
});


test('business copilot picks financially tested Groq GPT-OSS model while other general tasks remain unchanged',async()=>{
 configureAll();
 globalThis.fetch=async(_url,options)=>response(200,{choices:[{message:{content:'{"value":"safe-explanation"}'}}]});
 const result=await routeAiStructured({taskType:'business_copilot',prompt:'Fictional bookkeeping explanation',schema:schema()});
 assert.equal(result.success,true);
 assert.equal(result.provider,'groq');
 assert.equal(result.model,'openai/gpt-oss-120b');
 assert.equal(result.route,'general');
});

test('business copilot falls back to Cloudflare, never to Gemini or external vendors',async()=>{
 configureAll();
 process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
 process.env.OPENROUTER_API_KEY='synthetic-only';
 process.env.OLLAMA_API_KEY='synthetic-only';
 process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED='true';
 const urls=[];
 globalThis.fetch=async(url,options)=>{
  const target=String(url);urls.push(target);
  if(target.includes('groq.com'))return response(429,{error:{message:'rate limited'}});
  return response(200,{choices:[{message:{content:'{"value":"safe-fallback"}'}}]});
 };
 const result=await routeAiStructured({taskType:'business_copilot',prompt:'Private ledger context test',schema:schema()});
 assert.equal(result.success,true);
 assert.equal(result.provider,'cloudflare');
 assert.equal(result.model,'@cf/google/gemma-4-26b-a4b-it');
 assert.equal(result.fallbackUsed,true);
 assert.equal(urls.length,2);
 assert.ok(urls[0].includes('groq.com'));
 assert.ok(urls[1].includes('cloudflare.com'));
 assert.ok(urls.every(url=>!url.includes('ollama.com')&&!url.includes('openrouter.ai')&&!url.includes('googleapis.com')));
});

test('business copilot fails safely rather than using low-accuracy Gemini or unapproved providers',async()=>{
 configureAll();
 process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
 process.env.OPENROUTER_API_KEY='synthetic-only';
 process.env.OLLAMA_API_KEY='synthetic-only';
 process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED='true';
 const urls=[];
 globalThis.fetch=async(url)=>{
  urls.push(String(url));
  return response(429,{error:{message:'quota reached'}});
 };
 const result=await routeAiStructured({taskType:'business_copilot',prompt:'Private finance context',schema:schema()});
 assert.equal(result.success,false);
 assert.ok(result.errorCode==='AI_RATE_LIMITED'||result.errorCode==='AI_TEMPORARILY_UNAVAILABLE');
 assert.equal(urls.length,2,'only Groq and Cloudflare are allowed');
 assert.ok(urls.every(url=>url.includes('groq.com')||url.includes('cloudflare.com')));
});


test('private deep and vision dialogue never escapes the financially screened model pair',async()=>{
 configureAll();
 const seen=[];
 globalThis.fetch=async(url,options)=>{
  seen.push({url:String(url),model:JSON.parse(options.body).model});
  if(String(url).includes('groq.com'))return response(401,{});
  return response(200,{choices:[{message:{content:'{"value":"screened"}'}}]});
 };
 for(const request of [
  {taskType:'cfo_report',reasoningLevel:'deep'},
  {taskType:'business_copilot',reasoningLevel:'deep'},
  {taskType:'business_copilot',attachments:[{kind:'image',mimeType:'image/png',data:'YWJj'}]},
 ]){
  seen.length=0;
  const result=await routeAiStructured({...request,prompt:'Synthetic private-context routing check',schema:schema()});
  assert.equal(result.success,true);
  assert.equal(result.model,'@cf/google/gemma-4-26b-a4b-it');
  assert.ok(seen.every(call=>['openai/gpt-oss-120b','@cf/google/gemma-4-26b-a4b-it'].includes(call.model)));
 }
});

test('deep private dialogue fails closed if only an unscreened vendor is configured',async()=>{
 delete process.env.GROQ_API_KEY;delete process.env.CLOUDFLARE_AI_API_TOKEN;delete process.env.CLOUDFLARE_ACCOUNT_ID;
 process.env.GEMINI_API_KEY='synthetic-only';
 let calls=0;globalThis.fetch=async()=>{calls++;return response(200,{candidates:[{content:{parts:[{text:'{"value":"must not dispatch"}'}]}}]});};
 const result=await routeAiStructured({taskType:'cfo_report',reasoningLevel:'deep',prompt:'Synthetic data',schema:schema()});
 assert.equal(result.success,false);
 assert.equal(calls,0);
});


test('HTTP timeout hands off after one deadline instead of repeating the stalled provider',async()=>{
 configureAll();let clock=testClock;Date.now=()=>clock;const calls=[];
 globalThis.fetch=async(url)=>{
  calls.push({url:String(url),at:clock});
  if(String(url).includes('groq.com')){clock+=18_000;return response(504,{});}
  clock+=2_000;return response(200,{choices:[{message:{content:'{"value":"recovered"}'}}]});
 };
 const result=await routeAiStructured({taskType:'business_copilot',prompt:'Synthetic timeout',schema:schema(),timeoutMs:18_000});
 assert.equal(result.success,true);
 assert.equal(calls.filter(call=>call.url.includes('groq.com')).length,1);
 assert.equal(calls.find(call=>call.url.includes('cloudflare.com')).at-testClock,18_000);
 assert.equal(result.totalLatencyMs,20_000);
 assert.equal(result.attemptCount,2);
});

test('configured providers in quota cooldown report capacity instead of missing configuration',async()=>{
 configureAll();let calls=0;
 globalThis.fetch=async()=>{calls++;return response(429,{}, {'retry-after':'60'});};
 const request={taskType:'business_copilot',prompt:'Synthetic quota',schema:schema()};
 const first=await routeAiStructured(request);
 assert.equal(first.errorCode,'AI_RATE_LIMITED');
 const second=await routeAiStructured(request);
 assert.equal(second.errorCode,'AI_RATE_LIMITED');
 assert.equal(calls,2,'cooldown must suppress all new upstream requests');
});

test('fallback rechecks quota opened by another in-flight request before dispatch',async()=>{
 configureAll();let releaseFirst;let groqCalls=0,cloudflareCalls=0;
 globalThis.fetch=async(url)=>{
  if(String(url).includes('groq.com')){
   groqCalls++;
   if(groqCalls===1)return new Promise(resolve=>{releaseFirst=()=>resolve(response(401,{}));});
   return response(429,{});
  }
  cloudflareCalls++;return response(429,{});
 };
 const request={taskType:'business_copilot',prompt:'Synthetic concurrency',schema:schema()};
 const pending=routeAiStructured(request);
 const competing=await routeAiStructured(request);
 assert.equal(competing.errorCode,'AI_RATE_LIMITED');
 releaseFirst();const resumed=await pending;
 assert.equal(resumed.success,false);
 assert.equal(cloudflareCalls,1,'must not call a provider newly in cooldown');
 assert.equal(resumed.errorCode,'AI_RATE_LIMITED');
});


test('slow 5xx gives the alternate provider its turn while preserving fast transient retries',async()=>{
 configureAll();let clock=testClock;Date.now=()=>clock;let groqCalls=0;
 globalThis.fetch=async(url)=>{
  if(String(url).includes('groq.com')){groqCalls++;clock+=12_000;return response(503,{});}
  clock+=1_000;return response(200,{choices:[{message:{content:'{"value":"available"}'}}]});
 };
 const result=await routeAiStructured({taskType:'business_copilot',prompt:'Synthetic slow overload',schema:schema(),timeoutMs:18_000});
 assert.equal(result.success,true);assert.equal(groqCalls,1);
 assert.equal(result.totalLatencyMs,13_000);assert.equal(result.attemptCount,2);
});

test('route timing logs contain only fixed metadata and never user content or credentials',async()=>{
 configureAll();const originalInfo=console.info,originalWarn=console.warn,logs=[];
 console.info=(...args)=>logs.push(args);console.warn=(...args)=>logs.push(args);
 globalThis.fetch=async()=>response(200,{choices:[{message:{content:'{"value":"synthetic-response-secret"}'}}]});
 try{
  const result=await routeAiStructured({taskType:'business_copilot',prompt:'synthetic-prompt-secret',requestId:'synthetic-timing',schema:schema()});
  assert.equal(result.success,true);assert.equal(result.totalLatencyMs,0);assert.equal(result.attemptCount,1);
  const summary=logs.find(row=>row[0]==='[LOUREX AI route]')?.[1];
  assert.equal(summary.requestId,'synthetic-timing');assert.equal(summary.attemptCount,1);assert.equal(summary.totalLatencyMs,0);
  const serialized=JSON.stringify(logs);
  for(const secret of ['synthetic-prompt-secret','synthetic-response-secret','test-groq','test-cf','test-gemini'])assert.equal(serialized.includes(secret),false);
 }finally{console.info=originalInfo;console.warn=originalWarn;}
});


test('short tool-planner budget reserves fallback before the browser deadline',async()=>{
 configureAll();let deadline=0;const deadlines=[];
 globalThis.setTimeout=(fn,ms,...args)=>{deadline=ms;return originalSetTimeout(fn,ms,...args);};
 globalThis.fetch=async()=>{
  deadlines.push(deadline);testClock+=deadline;
  throw new DOMException('Synthetic stalled provider','AbortError');
 };
 const result=await routeAiStructured({taskType:'business_copilot',prompt:'Synthetic deadline',schema:schema(),timeoutMs:12_000,totalBudgetMs:11_000});
 assert.equal(result.success,false);
 assert.equal(result.errorCode,'AI_TIMEOUT');
 assert.ok(result.totalLatencyMs<=11_000,JSON.stringify(deadlines));
 assert.equal(deadlines.length,2,'reserve an alternate approved provider');
 assert.ok(deadlines.every(ms=>ms>=3_000));
});

test('insufficient request budget dispatches no provider',async()=>{
 configureAll();let calls=0;globalThis.fetch=async()=>{calls++;return response(200,{});};
 const result=await routeAiStructured({taskType:'business_copilot',prompt:'Synthetic deadline',schema:schema(),totalBudgetMs:4_000});
 assert.equal(result.errorCode,'AI_TIMEOUT');assert.equal(calls,0);
});

test('definitive provider/model rejections quarantine immediately then allow bounded recovery',async()=>{
 for(const status of [401,403,404]){
  ({routeAiStructured}=await import('../api/_ai/router.js?rejection='+status));
  configureAll();let groqCalls=0;let recovered=false;
  globalThis.fetch=async(url)=>{
   if(String(url).includes('groq.com')){groqCalls++;if(!recovered)return response(status,{});}
   return response(200,{choices:[{message:{content:'{"value":"ok"}'}}]});
  };
  const request={taskType:'business_copilot',prompt:'Synthetic rejected model',schema:schema()};
  assert.equal((await routeAiStructured(request)).provider,'cloudflare');
  assert.equal((await routeAiStructured(request)).provider,'cloudflare');
  assert.equal(groqCalls,1,'a definitive rejection must not be retried on the next customer turn');
  testClock+=300_001;recovered=true;
  assert.equal((await routeAiStructured(request)).provider,'groq','quarantine must expire and permit recovery');
  assert.equal(groqCalls,2);
 }
});

test('request-specific schema rejection does not disable the model for other requests',async()=>{
 configureAll();let groqCalls=0;
 globalThis.fetch=async(url)=>{
  if(String(url).includes('groq.com')&&++groqCalls===1)return response(400,{error:{message:'unsupported response_format schema'}});
  return response(200,{choices:[{message:{content:'{"value":"ok"}'}}]});
 };
 const request={taskType:'business_copilot',prompt:'Synthetic schema',schema:schema()};
 assert.equal((await routeAiStructured(request)).provider,'cloudflare');
 assert.equal((await routeAiStructured(request)).provider,'groq');
});

test('private visual source extraction has Groq vision plus approved Cloudflare fallback only',async()=>{
 configureAll();const calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push({url:String(url),model:JSON.parse(options.body).model});
  if(String(url).includes('groq.com'))return response(429,{});
  return response(200,{choices:[{message:{content:'{"value":"source facts"}'}}]});
 };
 const result=await routeAiStructured({taskType:'business_source_summary',attachments:[{kind:'image',mimeType:'image/png',data:'YWJj'}],prompt:'Synthetic image',schema:schema()});
 assert.equal(result.success,true);assert.equal(calls[0].model,'qwen/qwen3.8-27b');assert.equal(result.provider,'cloudflare');
 assert.equal(calls.length,2);
});
test('private visual source failure never escapes to Gemini or external sandbox vendors',async()=>{
 configureAll();process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';process.env.OPENROUTER_API_KEY='test-free';process.env.OLLAMA_API_KEY='test-ollama';process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED='true';
 const calls=[];globalThis.fetch=async(url)=>{calls.push(String(url));if(String(url).includes('groq.com')||String(url).includes('cloudflare.com'))return response(404,{});return response(200,{candidates:[{content:{parts:[{text:'{"value":"unapproved"}'}]}}]});};
 const result=await routeAiStructured({taskType:'business_source_summary',externalDataClass:'public-synthetic',attachments:[{kind:'image',mimeType:'image/png',data:'YWJj'}],prompt:'Synthetic privacy test',schema:schema()});
 assert.equal(result.success,false);assert.equal(calls.length,2);assert.ok(calls.every(url=>url.includes('groq.com')||url.includes('cloudflare.com')));
});
