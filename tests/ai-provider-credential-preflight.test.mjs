import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkProviderCredential} from '../api/_ai/provider-diagnostics.js';

const keys=['GROQ_API_KEY','MISTRAL_API_KEY','OLLAMA_API_KEY','LOUREX_AI_MISTRAL_FREE_VERIFIED','LOUREX_AI_OLLAMA_FREE_VERIFIED'];
const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
test.afterEach(()=>{for(const k of keys){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];}});

test('owner credential preflight never invokes model generation and does not require billable free-tier opt-in',async()=>{
  process.env.OLLAMA_API_KEY='synthetic-ollama-key';
  delete process.env.LOUREX_AI_MISTRAL_FREE_VERIFIED;
  delete process.env.LOUREX_AI_OLLAMA_FREE_VERIFIED;
  for(const [provider,url] of [
    ['ollama','https://ollama.com/api/tags']
  ]){
    let calls=0;
    const result=await checkProviderCredential(provider,{fetchImpl:async(input,options)=>{
      calls++;
      assert.equal(input,url);
      assert.equal(options.method,'GET');
      assert.equal(options.body,undefined);
      assert.equal(options.redirect,'error');
      assert.equal(options.cache,'no-store');
      assert.equal(options.headers.Authorization,'Bearer synthetic-'+provider+'-key');
      return{ok:true,status:200};
    }});
    assert.equal(calls,1);
    assert.equal(result.status,'KEY_AUTHENTICATED');
    assert.equal(result.inference,false);
    assert.equal(Object.hasOwn(result,'freePlanVerified'),false);
  }
});

test('key-check failures are redacted and do not mark a key as good',async()=>{
  process.env.OLLAMA_API_KEY='synthetic-ollama-key';
  const check=await checkProviderCredential('ollama',{fetchImpl:async()=>({ok:false,status:401})});
  assert.equal(check.status,'KEY_REJECTED');
  assert.equal(check.inference,false);
  assert.equal(JSON.stringify(check).includes('synthetic-ollama-key'),false);
  const payment=await checkProviderCredential('ollama',{fetchImpl:async()=>({ok:false,status:402})});
  assert.equal(payment.status,'PAYMENT_REQUIRED');
});

test('absent keys or unknown provider never initiate network requests',async()=>{
  delete process.env.GROQ_API_KEY;delete process.env.MISTRAL_API_KEY;delete process.env.OLLAMA_API_KEY;
  let calls=0;const fetchImpl=async()=>{calls++;throw Error('network must remain unused');};
  for(const provider of ['mistral','ollama','groq','unknown']){
    const result=await checkProviderCredential(provider,{fetchImpl});
    assert.ok(['NOT_CONFIGURED','INVALID_PROVIDER'].includes(result.status));
  }
  assert.equal(calls,0);
});

test('credential mode remains inside the same owner-authenticated server gate',()=>{
  const api=readFileSync(new URL('../api/ai-core.js',import.meta.url),'utf8');
  const page=readFileSync(new URL('../public/health.html',import.meta.url),'utf8');
  const client=readFileSync(new URL('../public/health.js',import.meta.url),'utf8');
  const gate=api.indexOf("x-lourex-admin-diagnostics']==='provider-probe'");
  const owner=api.indexOf('diagnosticsOwnerUidAllowed(',gate);
  const keyMode=api.indexOf("mode==='key-check'",gate);
  assert.ok(gate!==-1&&owner>gate&&keyMode>owner);
  assert.match(api,/checkProviderCredential\(provider\)/);
  for(const provider of ['groq','ollama']){
    assert.match(page,new RegExp('data-provider-key-check="'+provider+'"'));
    assert.match(client,/mode:'key-check'/);
  }
});
