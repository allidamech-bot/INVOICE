import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runSyntheticProviderDiagnostic,SYNTHETIC_PROVIDER_IDS} from '../api/_ai/provider-diagnostics.js';

const names=['GROQ_API_KEY','GEMINI_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','KILO_API_KEY'];
async function sandbox(fn){
 const before=names.map(key=>[key,process.env[key]]);
 Object.assign(process.env,{GROQ_API_KEY:'synthetic-groq-token',GEMINI_API_KEY:'synthetic-gemini-token',CLOUDFLARE_AI_API_TOKEN:'synthetic-cf-token',CLOUDFLARE_ACCOUNT_ID:'synthetic-account',KILO_API_KEY:'synthetic-kilo-token'});
 try{await fn();}finally{for(const [k,v] of before){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
function reply(data,status=200){return{ok:status===200,status,headers:{get:()=>null},text:async()=>JSON.stringify(data)};}
test('each provider receives only a synthetic arithmetic prompt, single provider, no fallback',async()=>{
 await sandbox(async()=>{
  assert.deepEqual(SYNTHETIC_PROVIDER_IDS,['groq','cloudflare','gemini','kilo']);
  for(const provider of SYNTHETIC_PROVIDER_IDS){
   let calls=0;
   const fetchImpl=async(url,options)=>{
    calls++;
    const body=JSON.parse(options.body),serialized=JSON.stringify(body);
    assert.ok(serialized.includes('8 items')&&serialized.includes('10%')&&serialized.includes('18%'));
    assert.ok(!serialized.includes('invoiceNumber')&&!serialized.includes('customerId'));
    if(provider==='kilo'){
     assert.equal(body.model,'kilo-auto/free');
     assert.equal(url,'https://ai-gateway.kilo.ai/api/v1/chat/completions');
    }
    if(provider==='groq')assert.equal(body.model,'openai/gpt-oss-120b');
    if(provider==='cloudflare')assert.equal(body.model,'@cf/google/gemma-4-26b-a4b-it');
    if(provider==='gemini')assert.ok(url.endsWith('/gemini-2.5-flash-lite:generateContent'));
    return provider==='gemini'?reply({candidates:[{content:{parts:[{text:'1062'}]}}]}):
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
  for(const name of ['paid','openrouter',{},null]){
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
  assert.equal(invalid.status,'EMPTY_OUTPUT');
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

test('legitimate formatted totals are accepted without weakening arithmetic validation',async()=>{
 await sandbox(async()=>{
  const cases=[
   {provider:'gemini',body:{candidates:[{content:{parts:[{text:'1,062.00 USD'}]}}]},expected:'PASSED'},
   {provider:'gemini',body:{candidates:[{content:{parts:[{text:'١٬٠٦٢'}]}}]},expected:'PASSED'},
   {provider:'cloudflare',body:{result:{model:'@cf/google/gemma-4-26b-a4b-it',choices:[{message:{content:[{type:'text',text:'Total: $1,062 USD'}]}}]}},expected:'PASSED'},
   {provider:'cloudflare',body:{result:{response:'1062'}},expected:'PASSED'},
   {provider:'kilo',body:{model:'nvidia/free-example',choices:[{message:{content:'\x60\x60\x60text\n1062\n\x60\x60\x60'},finish_reason:'stop'}]},expected:'PASSED'},
   {provider:'kilo',body:{choices:[{message:{parsed:{total:1062}}}]},expected:'PASSED'},
   {provider:'gemini',body:{candidates:[{content:{parts:[{text:'900 and later 1062'}]}}]},expected:'UNPARSEABLE_ANSWER'},
   {provider:'kilo',body:{choices:[{message:{content:'1042'}}]},expected:'WRONG_ANSWER'}
  ];
  for(const entry of cases){
    let attempts=0;
    const output=await runSyntheticProviderDiagnostic(entry.provider,{fetchImpl:async()=>{
      attempts++;
      return reply(entry.body);
    }});
    assert.equal(attempts,1,'must never fallback to another provider');
    assert.equal(output.status,entry.expected,entry.provider+' '+JSON.stringify(entry.body));
    if(entry.expected==='PASSED')assert.equal(output.answerPreview,'1062');
    if(entry.expected==='WRONG_ANSWER')assert.equal(output.answerPreview,'1042');
    assert.equal(output.correct,entry.expected==='PASSED');
    assert.ok(!JSON.stringify(output).includes('synthetic-'),'no API key output');
  }
 });
});

test('an empty, blocked, or truncated answer is not falsely described as a bad key or incorrect arithmetic',async()=>{
 await sandbox(async()=>{
  const samples=[
   {provider:'kilo',body:{choices:[{message:{content:null},finish_reason:'length'}]},expected:'OUTPUT_TRUNCATED'},
   {provider:'kilo',body:{choices:[{message:{content:null},finish_reason:'stop'}]},expected:'EMPTY_OUTPUT'},
   {provider:'gemini',body:{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[]}}]},expected:'OUTPUT_TRUNCATED'},
   {provider:'gemini',body:{candidates:[{finishReason:'SAFETY',content:{parts:[]}}]},expected:'OUTPUT_BLOCKED'},
   {provider:'cloudflare',body:{success:false,errors:[{message:'synthetic-sensitive-provider-error'}]},expected:'PROVIDER_ERROR'},
   {provider:'kilo',body:{error:{message:'synthetic-sensitive-provider-error'}},expected:'PROVIDER_ERROR'}
  ];
  for(const sample of samples){
   const output=await runSyntheticProviderDiagnostic(sample.provider,{fetchImpl:async()=>reply(sample.body)});
   assert.equal(output.status,sample.expected);
   assert.equal(output.correct,false);
   assert.ok(!JSON.stringify(output).includes('synthetic-sensitive-provider-error'),'never disclose upstream error bodies');
  }
 });
});

test('free Kilo remains explicit, Gemini uses no thinking, and limits allow short substantive responses',async()=>{
 await sandbox(async()=>{
  for(const provider of ['kilo','gemini','cloudflare']){
   let requests=0;
   const output=await runSyntheticProviderDiagnostic(provider,{fetchImpl:async(_url,options)=>{
    requests++;
    const body=JSON.parse(options.body);
    if(provider==='kilo'){
      assert.equal(body.model,'kilo-auto/free');
      assert.equal(body.max_tokens,512);
    }else if(provider==='gemini'){
      assert.equal(body.generationConfig.maxOutputTokens,256);
      assert.equal(body.generationConfig.thinkingConfig.thinkingBudget,0);
    }else{
      assert.equal(body.max_completion_tokens,256);
    }
    return provider==='gemini'?
      reply({candidates:[{content:{parts:[{text:'1062'}]}}]}):
      reply({choices:[{message:{content:'1062'}}]});
   }});
   assert.equal(requests,1);
   assert.equal(output.status,'PASSED');
  }
 });
});

test('diagnostic UI distinguishes provider answer, actual model and empty/truncated result',()=>{
 const js=readFileSync(new URL('../public/health.js',import.meta.url),'utf8');
 for(const code of ['EMPTY_OUTPUT','OUTPUT_TRUNCATED','OUTPUT_BLOCKED','UNPARSEABLE_ANSWER'])
   assert.ok(js.includes(code),code+' needs a separate truthful label');
 assert.match(js,/result\.textContent=label/);
 assert.match(js,/data\?\.answerPreview/);
 assert.match(js,/data\?\.actualModel/);
 assert.doesNotMatch(js,/innerHTML\s*=\s*label/);
});
