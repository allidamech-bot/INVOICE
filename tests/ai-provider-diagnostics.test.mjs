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
