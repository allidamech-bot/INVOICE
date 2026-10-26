import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch=globalThis.fetch,originalEnv={...process.env};
const schema={type:'OBJECT',properties:{value:{type:'STRING'}},required:['value']};
const image={kind:'image',mimeType:'image/png',data:'private-image-fixture'};
const pdf={kind:'native-document',mimeType:'application/pdf',data:'private-pdf-fixture',fileName:'private-customer.pdf'};
// All server routeAiStructured task labels, plus default/unknown tasks: new callers fail closed.
const tasks=['business_copilot','cfo_report','business_source_summary','quote_extract','ai_inbox_classification','supplier_purchase_extract','product_source_extract','product_mapping','customer_capture','supplier_capture','quote_pricing_intent','workspace_help',undefined,'future_business_task'];
let router,serial=0;
function reply(){return{ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{content:'{"value":"ok"}'}}],candidates:[{content:{parts:[{text:'{"value":"ok"}'}]}}]})};}
test.beforeEach(async()=>{
  for(const key of ['GROQ_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'])delete process.env[key];
  Object.assign(process.env,{GEMINI_API_KEY:'private-key-fixture',OPENROUTER_API_KEY:'test-openrouter',OLLAMA_API_KEY:'test-ollama',LOUREX_AI_NEW_PROVIDERS_ENABLED:'true',LOUREX_AI_OLLAMA_FREE_VERIFIED:'true'});
  router=await import('../api/_ai/router.js?private-doc='+ ++serial);
});
test.afterEach(()=>{globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);});

test('private tasks cannot dispatch text, images or PDFs to unapproved configured vendors',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return reply();};
  for(const taskType of tasks)for(const attachments of [[],[image],[pdf],[pdf,image]]){
    const result=await router.routeAiStructured({taskType,prompt:'private-prompt-fixture',schema,attachments});
    assert.equal(result.success,false,`${taskType}/${attachments[0]?.kind||'text'}`);
    assert.equal(result.errorCode,attachments.includes(pdf)?'AI_PRIVATE_DOCUMENT_UNAVAILABLE':'AI_NOT_CONFIGURED');
    assert.equal(result.attemptCount,0);
  }
  assert.equal(calls,0);
});

test('synthetic tag cannot reclassify document extraction or multimodal workspace help',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return reply();};
  for(const taskType of tasks)for(const attachments of [[],[image],[pdf]]){
    if(taskType==='workspace_help'&&!attachments.length)continue;
    const result=await router.routeAiStructured({taskType,externalDataClass:'public-synthetic',prompt:'private-prompt-fixture',schema,attachments});
    assert.equal(result.success,false,`${taskType}/${attachments[0]?.kind||'text'}`);
  }
  assert.equal(calls,0);
});

test('private text and image tasks select the unchanged approved models and safe fallback',async()=>{
  Object.assign(process.env,{GROQ_API_KEY:'test-groq',CLOUDFLARE_AI_API_TOKEN:'test-cf',CLOUDFLARE_ACCOUNT_ID:'acct'});
  for(const taskType of tasks)for(const attachments of [[],[image]]){
    const seen=[];globalThis.fetch=async(url,options)=>{seen.push({url:String(url),body:JSON.parse(options.body)});return reply();};
    const result=await router.routeAiStructured({taskType,prompt:'private-prompt-fixture',schema,attachments});
    assert.equal(result.success,true);assert.equal(result.provider,'groq');
    assert.equal(result.model,attachments.length?'qwen/qwen3.8-27b':'openai/gpt-oss-120b');
    if(attachments.length)assert.equal(seen[0].body.messages[0].content.at(-1).image_url.url,'data:image/png;base64,private-image-fixture');
  }
  for(const attachments of [[],[image]]){
    const seen=[];globalThis.fetch=async(url,options)=>{seen.push({url:String(url),model:JSON.parse(options.body).model});return String(url).includes('groq.com')?{ok:false,status:429,headers:{get:()=>null},text:async()=>'{}'}:reply();};
    const result=await router.routeAiStructured({taskType:'quote_extract',schema,attachments});
    assert.equal(result.success,true);assert.equal(result.provider,'cloudflare');assert.equal(result.model,'@cf/google/gemma-4-26b-a4b-it');
    assert.ok(seen.every(call=>call.url.includes('groq.com')||call.url.includes('cloudflare.com')));
  }
});

test('approved provider failures never fall through to unapproved document vendors',async()=>{
  Object.assign(process.env,{GROQ_API_KEY:'test-groq',CLOUDFLARE_AI_API_TOKEN:'test-cf',CLOUDFLARE_ACCOUNT_ID:'acct'});
  const calls=[];globalThis.fetch=async url=>{calls.push(String(url));return{ok:false,status:401,headers:{get:()=>null},text:async()=>'{}'};};
  const result=await router.routeAiStructured({taskType:'ai_inbox_classification',schema,attachments:[image]});
  assert.equal(result.success,false);assert.equal(calls.length,2);
  assert.ok(calls.every(url=>url.includes('groq.com')||url.includes('cloudflare.com')));
});

test('native PDF rejection returns a safe explicit error without logging file, prompt or keys',async()=>{
  const info=console.info,warn=console.warn,logs=[];let calls=0;
  console.info=(...args)=>logs.push(args);console.warn=(...args)=>logs.push(args);
  globalThis.fetch=async()=>{calls++;return reply();};
  try{
    const result=await router.routeAiStructured({taskType:'quote_extract',prompt:'private-prompt-fixture',schema,attachments:[pdf]});
    assert.equal(result.success,false);assert.equal(calls,0);
    const error=router.aiRouterPublicError(result);
    assert.equal(error.status,503);assert.equal(error.code,'AI_PRIVATE_DOCUMENT_UNAVAILABLE');assert.match(error.message,/approved.*PDF/i);
    assert.doesNotMatch(JSON.stringify({logs,error}),/private-(?:pdf|prompt|key|customer)/);
  }finally{console.info=info;console.warn=warn;}
});

test('explicit public synthetic text help retains its existing Gemini route',async()=>{
  globalThis.fetch=async()=>reply();
  const result=await router.routeAiStructured({taskType:'workspace_help',externalDataClass:'public-synthetic',prompt:'synthetic help',schema});
  assert.equal(result.success,true);assert.equal(result.provider,'gemini');
});
