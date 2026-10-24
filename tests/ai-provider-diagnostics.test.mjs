import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runSyntheticProviderDiagnostic,SYNTHETIC_PROVIDER_IDS,OLLAMA_SYNTHETIC_MODELS} from '../api/_ai/provider-diagnostics.js';

const names=['GROQ_API_KEY','GEMINI_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','KILO_API_KEY','OPENROUTER_API_KEY','MISTRAL_API_KEY','OLLAMA_API_KEY','LOUREX_AI_MISTRAL_FREE_VERIFIED','LOUREX_AI_OLLAMA_FREE_VERIFIED'];
async function sandbox(fn){
 const before=names.map(key=>[key,process.env[key]]);
 Object.assign(process.env,{GROQ_API_KEY:'synthetic-groq-token',GEMINI_API_KEY:'synthetic-gemini-token',CLOUDFLARE_AI_API_TOKEN:'synthetic-cf-token',CLOUDFLARE_ACCOUNT_ID:'synthetic-account',KILO_API_KEY:'synthetic-kilo-token',OPENROUTER_API_KEY:'synthetic-openrouter-token',MISTRAL_API_KEY:'synthetic-mistral-token',OLLAMA_API_KEY:'synthetic-ollama-token',LOUREX_AI_MISTRAL_FREE_VERIFIED:'true',LOUREX_AI_OLLAMA_FREE_VERIFIED:'true'});
 try{await fn();}finally{for(const [k,v] of before){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
function reply(data,status=200){return{ok:status===200,status,headers:{get:()=>null},text:async()=>JSON.stringify(data)};}
test('each provider receives only a synthetic arithmetic prompt, single provider, no fallback',async()=>{
 await sandbox(async()=>{
  assert.deepEqual(SYNTHETIC_PROVIDER_IDS,['groq','cloudflare','gemini','kilo','openrouter','ollama']);
  for(const provider of SYNTHETIC_PROVIDER_IDS){
   let calls=0;
   const fetchImpl=async(url,options)=>{
    calls++;
    const body=JSON.parse(options.body),serialized=JSON.stringify(body);
    assert.ok(serialized.includes('8 items')&&serialized.includes('10%')&&serialized.includes('18%'));
    assert.ok(!serialized.includes('invoiceNumber')&&!serialized.includes('customerId'));
    if(provider==='kilo'){
     assert.equal(body.model,'google/gemma-4-26b-a4b-it:free');
     assert.ok(body.model.endsWith(':free'),'Kilo diagnostic may never select a paid model');
     assert.equal(body.temperature,0,'pin deterministic decoding in the isolated diagnostic');
     assert.equal(url,'https://ai-gateway.kilo.ai/api/v1/chat/completions');
    }
    if(provider==='groq')assert.equal(body.model,'openai/gpt-oss-120b');
    if(provider==='openrouter'){assert.equal(body.model,'openrouter/free');assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.deepEqual(body.provider,{data_collection:'deny'});}
    if(provider==='ollama'){assert.equal(body.model,'gemma4:31b');assert.equal(url,'https://ollama.com/api/chat');assert.equal(body.stream,false);}

    if(provider==='cloudflare'){
     assert.equal(body.model,'@cf/google/gemma-4-26b-a4b-it');
     assert.deepEqual(body.chat_template_kwargs,{enable_thinking:false},'avoid spending 256 completion tokens on Gemma reasoning');
     assert.equal(body.max_completion_tokens,256,'do not raise free-tier output usage for the diagnostics');
    }
    if(provider!=='cloudflare')
     assert.equal(body.chat_template_kwargs,undefined,'no other provider should inherit Cloudflare-only options');
    if(provider==='gemini')assert.ok(url.endsWith('/gemini-2.5-flash-lite:generateContent'));
    return provider==='ollama'?reply({message:{content:'1062'},done_reason:'stop',model:'gemma4:31b'}):
     provider==='gemini'?reply({candidates:[{content:{parts:[{text:'1062'}]}}]}):
     provider==='cloudflare'?reply({result:{choices:[{message:{content:'1062'}}]}}):
     reply({choices:[{message:{content:'1062'}}]});
   };
   const result=await runSyntheticProviderDiagnostic(provider,{fetchImpl});
   assert.equal(calls,1);
   assert.equal(result.status,'PASSED',provider);
   assert.equal(result.correct,true);
   assert.ok(!JSON.stringify(result).includes('synthetic-'),'never return tokens');
  }
 });
});
test('unknown names, wrong answers and payment errors do not initiate fallback',async()=>{
 await sandbox(async()=>{
  let calls=0;
  for(const name of ['paid','openrouter/paid',{},null]){
   const result=await runSyntheticProviderDiagnostic(name,{fetchImpl:async()=>{calls++;throw Error('Unexpected network');}});
   assert.equal(result.status,'INVALID_PROVIDER');
  }
  assert.equal(calls,0);
  const wrong=await runSyntheticProviderDiagnostic('kilo',{fetchImpl:async()=>reply({choices:[{message:{content:'1042'}}]})});
  assert.equal(wrong.status,'WRONG_ANSWER');
  const paid=await runSyntheticProviderDiagnostic('kilo',{fetchImpl:async()=>reply({error:{message:'secret'}},402)});
  assert.equal(paid.status,'PAYMENT_REQUIRED');
  assert.ok(!JSON.stringify(paid).includes('secret'));
  const rate=await runSyntheticProviderDiagnostic('groq',{fetchImpl:async()=>reply({},429)});
  assert.equal(rate.status,'RATE_LIMITED');
  const invalid=await runSyntheticProviderDiagnostic('gemini',{fetchImpl:async()=>reply({candidates:[]})});
  assert.equal(invalid.status,'INVALID_RESPONSE');
 });
});
test('missing key and invalid provider never call external services',async()=>{
 await sandbox(async()=>{
  delete process.env.KILO_API_KEY;
  const result=await runSyntheticProviderDiagnostic('kilo',{fetchImpl:async()=>{throw Error('unexpected request');}});
  assert.equal(result.status,'NOT_CONFIGURED');
 });
});
test('UI requires owner verification, only manual buttons, server-side signed UID check',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const html=read('public/health.html'),js=read('public/health.js'),api=read('api/ai-core.js');
 assert.match(html,/<main hidden>/);
 for(const name of SYNTHETIC_PROVIDER_IDS)assert.ok(html.includes('data-provider-test="'+name+'"'));
 assert.match(js,/if\(!await ownerPermission\(\)\)/);
 assert.match(js,/button\.addEventListener\('click',async\(\)=>/);
 assert.match(api,/request\.headers\['x-lourex-admin-diagnostics'\]==='provider-probe'/);
 assert.match(api,/diagnosticsOwnerUidAllowed\(request\.aiVerifiedUid,process\.env\.LOUREX_AI_DIAGNOSTICS_ADMIN_UID\)/);
});

test('a truncated Cloudflare model answer is not counted as a correct calculation',async()=>{
 await sandbox(async()=>{
  let calls=0;
  const result=await runSyntheticProviderDiagnostic('cloudflare',{fetchImpl:async()=>{
   calls++;
   return reply({choices:[{finish_reason:'length',message:{content:''}}],usage:{completion_tokens:256}});
  }});
  assert.equal(calls,1);
  assert.equal(result.status,'OUTPUT_TRUNCATED');
  assert.equal(result.correct,false);
  assert.equal(result.reason,'EMPTY_CONTENT');
 });
});

test('Ollama cannot spend any credit without explicit verified-free opt-in',async()=>{
 await sandbox(async()=>{
  delete process.env.LOUREX_AI_MISTRAL_FREE_VERIFIED;
  delete process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED;
  for(const provider of ['ollama'])for(const mode of ['single','financial']){
   let calls=0;
   const result=await runSyntheticProviderDiagnostic(provider,{mode,fetchImpl:async()=>{calls++;throw new Error('Unexpected outbound request');}});
   assert.equal(calls,0,provider);
   assert.equal(result.status,'FREE_TIER_NOT_VERIFIED',provider);
   assert.equal(result.correct,false);
  }
 });
});


test('Ollama alternate is only the owner-verified free-list model; no arbitrary or paid model can be requested',async()=>{
 await sandbox(async()=>{
  assert.deepEqual(OLLAMA_SYNTHETIC_MODELS,['gemma4:31b','gpt-oss:20b']);
  let calls=0;
  const failFetch=async()=>{calls++;throw Error('Invalid model must not hit network');};
  for(const provider of ['groq','openrouter','kilo']){
   const bad=await runSyntheticProviderDiagnostic(provider,{mode:'financial',model:'gpt-oss:20b',fetchImpl:failFetch});
   assert.equal(bad.status,'INVALID_DIAGNOSTIC_MODEL');
  }
  for(const model of ['gpt-oss:120b-cloud','gemma4:999b','arbitrary/paid',null,42,{}]){
   const bad=await runSyntheticProviderDiagnostic('ollama',{mode:'financial',model,fetchImpl:failFetch});
   assert.equal(bad.status,'INVALID_DIAGNOSTIC_MODEL');
  }
  assert.equal(calls,0);
 });
});

test('Ollama free GPT-OSS alternate uses exactly one fixed synthetic five-case QA call',async()=>{
 await sandbox(async()=>{
  let calls=0;
  const result=await runSyntheticProviderDiagnostic('ollama',{
   mode:'financial',model:'gpt-oss:20b',
   fetchImpl:async(url,options)=>{
    calls++;
    assert.equal(url,'https://ollama.com/api/chat');
    assert.equal(options.method,'POST');
    const body=JSON.parse(options.body);
    assert.equal(body.model,'gpt-oss:20b');
    assert.equal(body.stream,false);
    assert.equal(body.format,'json');
    assert.equal(body.messages.length,1);
    assert.match(body.messages[0].content,/FIVE INDEPENDENT, SYNTHETIC/);
    assert.ok(!JSON.stringify(body).includes('customerId'));
    return reply({model:'gpt-oss:20b',done_reason:'stop',
      message:{role:'assistant',content:JSON.stringify({D1:214.2,D2:725,D3:220.8,D4:770,D5:100})}});
   }
  });
  assert.equal(calls,1);
  assert.equal(result.model,'gpt-oss:20b');
  assert.equal(result.status,'PASSED');
  assert.equal(result.score,5);
  assert.equal(result.cases.length,5);
 });
});

test('Ollama alternate remains blocked when free-account authorization is absent',async()=>{
 await sandbox(async()=>{
  delete process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED;
  let calls=0;
  const result=await runSyntheticProviderDiagnostic('ollama',{mode:'financial',model:'gpt-oss:20b',
    fetchImpl:async()=>{calls++;throw Error('no inference allowed');}});
  assert.equal(result.status,'FREE_TIER_NOT_VERIFIED');
  assert.equal(calls,0);
 });
});

test('owner model override is validated ahead of per-provider budget and cannot reach live chat',()=>{
 const core=readFileSync(new URL('../api/ai-core.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/health.html',import.meta.url),'utf8');
 const client=readFileSync(new URL('../public/health.js',import.meta.url),'utf8');
 const gate=core.indexOf("request.headers['x-lourex-admin-diagnostics']==='provider-probe'");
 const owner=core.indexOf('diagnosticsOwnerUidAllowed(',gate);
 const validation=core.indexOf('OLLAMA_SYNTHETIC_MODELS.includes(requestedModel)',owner);
 const budget=core.indexOf('diagnosticRateAllowed(',owner);
 const live=core.indexOf("if(!rateAllowed(request))",gate);
 assert.ok(gate!==-1&&gate<owner&&owner<validation&&validation<budget&&budget<live);
 assert.match(core,/provider!=='ollama'\|\|mode!=='financial'/);
 assert.match(ui,/data-diagnostic-model="gpt-oss:20b"/);
 assert.match(ui,/data-ollama-alt-result/);
 assert.match(client,/alternativeModel!==null/);
 assert.match(client,/mode:'financial',model:alternativeModel/);
});
