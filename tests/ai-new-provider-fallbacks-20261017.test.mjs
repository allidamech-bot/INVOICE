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

test('keys cannot enable new external providers without explicit privacy consent',async()=>{
  process.env.OPENROUTER_API_KEY='fake-key';
  process.env.MISTRAL_API_KEY='fake-key';
  process.env.OLLAMA_API_KEY='fake-key';
  process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED='true';
  let calls=0;globalThis.fetch=async()=>{calls++;return response(200,{});};
  const result=await ask();
  assert.equal(result.success,false);
  assert.equal(result.errorCode,'AI_NOT_CONFIGURED');
  assert.equal(calls,0);
});

test('retired OpenRouter credentials cannot dispatch',async()=>{
 process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';process.env.OPENROUTER_API_KEY='fake-key';
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Removed adapter');};
 const result=await ask();assert.equal(result.success,false);assert.equal(calls,0);
});

test('Mistral stays removed even if old free-plan flags and key remain',async()=>{
  process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
  process.env.MISTRAL_API_KEY='fake-key';
  process.env.LOUREX_AI_MISTRAL_FREE_VERIFIED='true';
  let calls=0;globalThis.fetch=async()=>{calls++;return response(200,{});};
  const result=await ask();assert.equal(result.success,false);assert.equal(calls,0);
});

test('Ollama Cloud uses direct hosted API, no local device, and validates JSON locally',async()=>{
  process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
  process.env.OLLAMA_API_KEY='fake-key';
  process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED='true';
  let body,url;
  globalThis.fetch=async(u,options)=>{url=String(u);body=JSON.parse(options.body);return response(200,{message:{role:'assistant',content:'{"value":"ollama-ok"}'}});};
  const result=await ask();
  assert.equal(result.success,true);
  assert.equal(result.provider,'ollama');
  assert.equal(result.data.value,'ollama-ok');
  assert.equal(url,'https://ollama.com/api/chat');
  assert.equal(body.stream,false);
  assert.equal(body.format,undefined,'Ollama Cloud does not currently support schema-constrained output');
  assert.equal(body.model,'gemma4:31b');
});

test('retired credentials cannot precede the permitted public Ollama route',async()=>{
  process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
  process.env.OPENROUTER_API_KEY='fake-key';
  process.env.OLLAMA_API_KEY='fake-key';
  process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED='true';
  const calls=[];
  globalThis.fetch=async(url)=>{
    calls.push(String(url));
    if(String(url).includes('openrouter.ai'))return response(429,{error:{message:'free quota exhausted'}});
    return response(200,{message:{content:'{"value":"ollama-fallback"}'}});
  };
  const result=await ask();
  assert.equal(result.success,true);
  assert.equal(result.provider,'ollama');
  assert.equal(result.fallbackUsed,false);
  assert.equal(calls.length,1);
  // Subsequent customer requests must not hit an exhausted provider again
  // while the account-wide cooldown is active.
  const second=await ask();
  assert.equal(second.success,true);
  assert.equal(second.provider,'ollama');
  assert.equal(calls.length,2);
  assert.ok(calls[1].includes('ollama.com'));
});

test('new provider output violating the financial JSON contract cannot be accepted',async()=>{
  process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
  process.env.OLLAMA_API_KEY='fake-key';
  process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED='true';
  globalThis.fetch=async()=>response(200,{message:{content:'{"value":"ok","unapproved":true}'}});
  const result=await ask();
  assert.equal(result.success,false);
  assert.equal(result.errorCode,'AI_INVALID_RESULT');
});

test('new text providers cannot ingest images or native PDFs without supported capability',async()=>{
  process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
  process.env.OPENROUTER_API_KEY='fake-key';
  process.env.MISTRAL_API_KEY='fake-key';
  process.env.LOUREX_AI_MISTRAL_FREE_VERIFIED='true';
  process.env.OLLAMA_API_KEY='fake-key';
  process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED='true';
  let calls=0;globalThis.fetch=async()=>{calls++;return response(200,{});};
  const image=await routeAiStructured({taskType:'customer_capture',prompt:'image',schema,attachments:[{kind:'image',mimeType:'image/png',data:'YWJj'}]});
  const pdf=await routeAiStructured({taskType:'quote_extract',prompt:'pdf',schema,attachments:[{kind:'native-document',mimeType:'application/pdf',data:'YWJj'}]});
  assert.equal(image.errorCode,'AI_NOT_CONFIGURED');
  assert.equal(pdf.errorCode,'AI_NOT_CONFIGURED');
  assert.equal(calls,0);
});

test('global opt-in and real keys cannot leak a business prompt without explicit per-request classification',async()=>{
  process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
  process.env.OPENROUTER_API_KEY='fake-key';
  process.env.OLLAMA_API_KEY='fake-key';
  process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED='true';
  let calls=0;globalThis.fetch=async()=>{calls++;return response(200,{});};
  const result=await routeAiStructured({
    taskType:'business_copilot',
    prompt:'Sensitive supplier invoice and private customer balance',
    schema
  });
  assert.equal(result.success,false);
  assert.equal(result.errorCode,'AI_NOT_CONFIGURED');
  assert.equal(calls,0);
});

test('sensitive workflow classification remains isolated even with a forged synthetic tag',async()=>{
  process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
  process.env.OPENROUTER_API_KEY='fake-key';
  let calls=0;globalThis.fetch=async()=>{calls++;return response(200,{});};
  const result=await routeAiStructured({
    taskType:'supplier_purchase_extract',
    prompt:'Sensitive supplier order',
    schema,
    externalDataClass:'public-synthetic'
  });
  assert.equal(result.success,false);
  assert.equal(result.errorCode,'AI_NOT_CONFIGURED');
  assert.equal(calls,0);
});
