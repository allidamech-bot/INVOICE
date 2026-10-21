import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySyntheticProviderAnswer} from '../api/_ai/provider-diagnostic-classifier.js';
import {runSyntheticProviderDiagnostic} from '../api/_ai/provider-diagnostics.js';

test('exact number and common currency formats are marked correct without fake failures',()=>{
 const values=['1062','1,062.00','USD 1,062.00','الإجمالي ١٬٠٦٢','The total is 1062.00 USD'];
 // Arabic thousands mark is intentionally unsupported until unambiguous; see explicit example below.
 for(const value of values.filter(x=>!x.includes('٬'))){
  const r=classifySyntheticProviderAnswer({choices:[{message:{content:value},finish_reason:'stop'}]},'kilo');
  assert.equal(r.status,'PASSED',value);
  assert.equal(r.reportedTotal,1062);
 }
});
test('Gemini returns wrong arithmetic with the actual number rather than a misleading generic failure',()=>{
 const answer=classifySyntheticProviderAnswer({candidates:[{content:{parts:[{text:'1000'}]},finishReason:'STOP'}]},'gemini');
 assert.equal(answer.status,'WRONG_ANSWER');
 assert.equal(answer.reportedTotal,1000);
 assert.equal(answer.finishReason,'STOP');
});
test('Kilo empty assistant content with length stop is diagnosed as truncation, not bad credentials',()=>{
 const reply={choices:[{message:{content:null},finish_reason:'length'}],usage:{completion_tokens:120}};
 const r=classifySyntheticProviderAnswer(reply,'kilo');
 assert.equal(r.status,'OUTPUT_TRUNCATED');
 assert.equal(r.reason,'EMPTY_CONTENT');
 assert.equal(r.finishReason,'LENGTH');
 assert.equal(r.completionTokens,120);
});
test('Cloudflare supports direct OpenAI and account wrapped reply formats',()=>{
 const replies=[
  {choices:[{message:{content:'1062'},finish_reason:'stop'}]},
  {result:{choices:[{message:{content:'1062'},finish_reason:'stop'}]}},
  {result:{response:'1062'}}
 ];
 for(const reply of replies)assert.equal(classifySyntheticProviderAnswer(reply,'cloudflare').status,'PASSED');
});
test('multiple intermediate arithmetic numbers are marked ungradable, not incorrectly wrong',()=>{
 const r=classifySyntheticProviderAnswer({candidates:[{content:{parts:[{text:'8 × 125 = 1000; discount 10% = 900; tax 18% = 1062'}]}}]},'gemini');
 assert.equal(r.status,'ANSWER_FORMAT');
 assert.equal(r.reason,'MULTIPLE_NUMBERS');
 assert.equal(r.reportedTotal,undefined);
 assert.ok(r.answerPreview?.length<=110);
});
test('a valid HTTP response without expected text stays unverified without leaking vendor body',()=>{
 const payload={result:{errors:[{message:'secret-value from upstream'}]}};
 const r=classifySyntheticProviderAnswer(payload,'cloudflare');
 assert.equal(r.status,'INVALID_RESPONSE');
 assert.equal(r.reason,'EMPTY_CONTENT');
 assert.ok(!JSON.stringify(r).includes('secret-value'));
});
test('Kilo synthetic probe requests remain on free route, cannot fall back, and reveal truncation',async()=>{
 const previous=process.env.KILO_API_KEY;
 process.env.KILO_API_KEY='synthetic-qa-key-only';
 try{
  let calls=0;
  const r=await runSyntheticProviderDiagnostic('kilo',{fetchImpl:async(url,opt)=>{
   calls++;
   assert.equal(url,'https://ai-gateway.kilo.ai/api/v1/chat/completions');
   const body=JSON.parse(opt.body);
   assert.equal(body.model,'kilo-auto/free');
   assert.equal(body.max_tokens,384);
   assert.equal(body.messages.length,1);
   assert.ok(body.messages[0].content.includes('Synthetic accounting'));
   return{ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify({choices:[{message:{content:null},finish_reason:'length'}]})};
  }});
  assert.equal(calls,1);
  assert.equal(r.status,'OUTPUT_TRUNCATED');
  assert.equal(r.correct,false);
 }finally{
  if(previous===undefined)delete process.env.KILO_API_KEY;else process.env.KILO_API_KEY=previous;
 }
});


test('server recognizes parsed OpenAI content arrays and Cloudflare wrapper without extra network calls',()=>{
 const examples=[
  {body:{choices:[{message:{content:[{type:'text',text:{value:'1062'}}]}}]},provider:'kilo'},
  {body:{result:{choices:[{message:{parsed:{total:1062}}}]}},provider:'cloudflare'},
  {body:{result:{choices:[{message:{content:null}}],response:'1062'}},provider:'cloudflare'}
 ];
 for(const {body,provider} of examples){
  const result=classifySyntheticProviderAnswer(body,provider);
  assert.equal(result.status,'PASSED',provider);
  assert.equal(result.reportedTotal,1062);
 }
});

test('200 HTTP provider error envelopes and safety blocks are not misclassified as invalid output or bad math',()=>{
 const cases=[
  {provider:'kilo',body:{error:{message:'SECRET_UPSTREAM_ERROR'}},status:'PROVIDER_ERROR',reason:'UPSTREAM_ERROR_BODY'},
  {provider:'cloudflare',body:{success:false,errors:[{message:'SECRET_UPSTREAM_ERROR'}]},status:'PROVIDER_ERROR',reason:'UPSTREAM_ERROR_BODY'},
  {provider:'gemini',body:{candidates:[{finishReason:'SAFETY',content:{parts:[]}}]},status:'OUTPUT_BLOCKED',reason:'OUTPUT_BLOCKED'},
  {provider:'kilo',body:{choices:[{finish_reason:'content_filter',message:{content:null}}]},status:'OUTPUT_BLOCKED',reason:'OUTPUT_BLOCKED'},
  {provider:'gemini',body:{candidates:[{finishReason:'MAX_OUTPUT_TOKENS',content:{parts:[]}}]},status:'OUTPUT_TRUNCATED',reason:'EMPTY_CONTENT'}
 ];
 for(const entry of cases){
  const result=classifySyntheticProviderAnswer(entry.body,entry.provider);
  assert.equal(result.status,entry.status);
  assert.equal(result.reason,entry.reason);
  assert.ok(!JSON.stringify(result).includes('SECRET_UPSTREAM_ERROR'),'upstream errors are never reflected');
 }
});

test('Kilo underlying model metadata is exposed only when safe; Gemini skips thought parts',()=>{
 const direct=classifySyntheticProviderAnswer({model:'nvidia/free-model',choices:[{message:{content:'1062'}}]},'kilo');
 assert.equal(direct.status,'PASSED');
 assert.equal(direct.actualModel,'nvidia/free-model');
 const hostile=classifySyntheticProviderAnswer({model:'free-model<script>',choices:[{message:{content:'1062'}}]},'kilo');
 assert.equal(hostile.status,'PASSED');
 assert.equal(hostile.actualModel,undefined);
 const gemini=classifySyntheticProviderAnswer({
  modelVersion:'gemini-2.5-flash-lite',
  candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'do not grade 1042'},{text:'1062'}]}}]
 },'gemini');
 assert.equal(gemini.status,'PASSED');
 assert.equal(gemini.actualModel,'gemini-2.5-flash-lite');
});

test('UI retains the owner gate and renders resolved model metadata as text only',async()=>{
 const script=await import('node:fs/promises').then(fs=>fs.readFile(new URL('../public/health.js',import.meta.url),'utf8'));
 assert.match(script,/if\(!await ownerPermission\(\)\)/);
 assert.match(script,/data\?\.actualModel/);
 assert.match(script,/result\.textContent=label/);
 assert.doesNotMatch(script,/result\.innerHTML\s*=/);
});

test('a numerically correct but unfinished or safety-blocked reply is never PASSED',()=>{
 for(const provider of ['kilo','openrouter','cloudflare']){
  for(const finish_reason of ['length','max_tokens','max_output_tokens']){
   const reply={model:'free/test-model',choices:[{message:{content:'1062'},finish_reason}]};
   const r=classifySyntheticProviderAnswer(reply,provider);
   assert.equal(r.status,'OUTPUT_TRUNCATED',provider+' '+finish_reason);
   assert.equal(r.reason,'TRUNCATED_CONTENT');
   assert.equal(r.reportedTotal,undefined);
   assert.equal(r.actualModel,'free/test-model');
  }
 }
 const safety=classifySyntheticProviderAnswer({
  candidates:[{finishReason:'SAFETY',content:{parts:[{text:'1062'}]}}]
 },'gemini');
 assert.equal(safety.status,'OUTPUT_BLOCKED');
 assert.equal(safety.reportedTotal,undefined);
});
