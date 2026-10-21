import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkGeminiKeyMetadata} from '../api/_ai/gemini-key-metadata.js';

async function withKey(fn){
 const previous=process.env.GEMINI_API_KEY;
 process.env.GEMINI_API_KEY='synthetic-secret-gemini-token';
 try{await fn();}finally{
  if(previous===undefined)delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY=previous;
 }
}
function reply(status,body){
 return{ok:status===200,status,headers:{get:()=>null},text:async()=>JSON.stringify(body)};
}
test('owner model lookup sends no prompt, inference, documents or secrets',async()=>{
 await withKey(async()=>{
  let count=0;
  const result=await checkGeminiKeyMetadata({fetchImpl:async(url,options)=>{
   count++;
   assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite');
   assert.equal(options.method,'GET');
   assert.equal(options.headers['x-goog-api-key'],'synthetic-secret-gemini-token');
   assert.equal(options.body,undefined);
   return reply(200,{name:'models/gemini-2.5-flash-lite',supportedGenerationMethods:['generateContent']});
  }});
  assert.equal(count,1);
  assert.equal(result.status,'METADATA_ACCESS_OK');
  assert.equal(result.generativeMethodListed,true);
  assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
 });
});
test('rejects invalid credentials/permission without exposing upstream body',async()=>{
 await withKey(async()=>{
  const cases=[[401,'KEY_REJECTED'],[403,'ACCESS_DENIED'],[402,'PAYMENT_REQUIRED'],[404,'MODEL_UNAVAILABLE'],[429,'RATE_LIMITED'],[500,'PROVIDER_UNAVAILABLE']];
  for(const [http,expected] of cases){
   const result=await checkGeminiKeyMetadata({fetchImpl:async()=>reply(http,{error:{message:'DO_NOT_REVEAL_PROVIDER_TEXT'}})});
   assert.equal(result.status,expected);
   assert.ok(!JSON.stringify(result).includes('DO_NOT_REVEAL_PROVIDER_TEXT'));
  }
 });
});
test('unconfigured key never invokes network',async()=>{
 await withKey(async()=>{
  delete process.env.GEMINI_API_KEY;
  const result=await checkGeminiKeyMetadata({fetchImpl:async()=>{throw Error('unexpected');}});
  assert.equal(result.status,'NOT_CONFIGURED');
 });
});
test('model name mismatch or malformed body is not falsely reported as key success',async()=>{
 await withKey(async()=>{
  const mismatch=await checkGeminiKeyMetadata({fetchImpl:async()=>reply(200,{name:'models/unrelated'})});
  assert.equal(mismatch.status,'INVALID_RESPONSE');
  const malformed=await checkGeminiKeyMetadata({fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>'<invalid>'})});
  assert.equal(malformed.status,'INVALID_RESPONSE');
 });
});
test('Firebase UID, same-origin protection, owner rate limits and manual-only UI guard metadata lookup',()=>{
 const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const ai=get('api/ai-core.js'),html=get('public/health.html'),script=get('public/health.js');
 const auth=ai.indexOf('if(!await requireAiFirebaseAuth(request,response))return;');
 const branch=ai.indexOf("if(request.headers['x-lourex-admin-diagnostics']==='gemini-key-check')");
 const gate=ai.indexOf('diagnosticsOwnerUidAllowed(',branch);
 const check=ai.indexOf('checkGeminiKeyMetadata()',branch);
 assert.ok(auth>0&&branch>auth&&gate>branch&&check>gate);
 assert.match(ai,/if\(!sameOriginRequest\(request\)\)/);
 assert.match(ai,/diagnosticRateAllowed\(request\.aiVerifiedUid,'gemini-key-metadata'\)/);
 assert.match(html,/id="geminiKeyCheck"/);
 assert.match(html,/id="geminiKeyResult"/);
 assert.match(script,/geminiKeyButton\?\.addEventListener\('click',async\(\)=>/);
 assert.doesNotMatch(script,/window\.localStorage\.getItem\('GEMINI_API_KEY'\)/);
});
