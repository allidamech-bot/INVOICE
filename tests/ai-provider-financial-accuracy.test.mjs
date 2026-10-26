import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FINANCIAL_QA_CASES,FINANCIAL_QA_PROMPT,classifyFinancialAccuracyResponse} from '../api/_ai/provider-financial-accuracy.js';
import {runSyntheticProviderDiagnostic,SYNTHETIC_PROVIDER_IDS} from '../api/_ai/provider-diagnostics.js';

const expected={D1:214.2,D2:725,D3:220.8,D4:770,D5:100};
const dummyKeys=['GROQ_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','GEMINI_API_KEY','KILO_API_KEY','OPENROUTER_API_KEY','MISTRAL_API_KEY','OLLAMA_API_KEY','LOUREX_AI_MISTRAL_FREE_VERIFIED','LOUREX_AI_OLLAMA_FREE_VERIFIED'];
async function withSyntheticKeys(fn){
 const previous=dummyKeys.map(k=>[k,process.env[k]]);
 Object.assign(process.env,{
  GROQ_API_KEY:'test-groq-non-secret',CLOUDFLARE_AI_API_TOKEN:'test-cf-non-secret',
  CLOUDFLARE_ACCOUNT_ID:'test-cf-account',GEMINI_API_KEY:'test-gemini-non-secret',
  KILO_API_KEY:'test-kilo-non-secret',OPENROUTER_API_KEY:'test-openrouter-non-secret',MISTRAL_API_KEY:'test-mistral-non-secret',OLLAMA_API_KEY:'test-ollama-non-secret',LOUREX_AI_MISTRAL_FREE_VERIFIED:'true',LOUREX_AI_OLLAMA_FREE_VERIFIED:'true'
 });
 try{await fn();}finally{for(const [k,v] of previous){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
const fakeBody=(provider,data=expected)=>{
 if(provider==='ollama')return{message:{content:JSON.stringify(data)},done_reason:'stop',model:'gemma4:31b'};
 if(provider==='cloudflare')return{result:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}]}};
 return{choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}]};
};
const reply=(body,status=200)=>({ok:status===200,status,headers:{get:()=>null},text:async()=>JSON.stringify(body)});

test('accounting QA pack uses exactly five real fixed-reference calculations, no app data',()=>{
 assert.deepEqual(Object.fromEntries(FINANCIAL_QA_CASES.map(({id,expected})=>[id,expected])),expected);
 assert.equal(FINANCIAL_QA_CASES.length,5);
 for(const id of ['D1','D2','D3','D4','D5'])assert.ok(FINANCIAL_QA_PROMPT.includes(id+':'));
 for(const token of ['customerId','workspaceUid','privateKey','invoiceNumber','documentId'])assert.ok(!FINANCIAL_QA_PROMPT.includes(token));
});

test('financial pack calls only selected provider with server-owned fixed JSON task',async()=>{
 await withSyntheticKeys(async()=>{
  for(const provider of SYNTHETIC_PROVIDER_IDS){
   let hits=0;
   const result=await runSyntheticProviderDiagnostic(provider,{mode:'financial',fetchImpl:async(url,init)=>{
    hits++;
    const body=JSON.parse(init.body),text=JSON.stringify(body);
    assert.ok(text.includes('FIVE INDEPENDENT, SYNTHETIC'),provider);
    assert.ok(text.includes('D5:'),provider);
    assert.ok(!text.includes('customerId'));
    if(provider==='cloudflare'){
     assert.equal(body.model,'@cf/google/gemma-4-26b-a4b-it');
     assert.deepEqual(body.chat_template_kwargs,{enable_thinking:false});
     assert.equal(body.max_completion_tokens,256);
    }
    if(provider==='openrouter'){assert.equal(body.model,'openrouter/free');assert.deepEqual(body.provider,{data_collection:'deny'});}
    if(provider==='ollama'){assert.equal(body.model,'gemma4:31b');assert.equal(body.format,'json');assert.equal(body.stream,false);}
    if(provider==='kilo'){
     assert.equal(body.model,'google/gemma-4-26b-a4b-it:free');
     assert.ok(body.model.endsWith(':free'),'finance QA must only use the pinned zero-cost Kilo model');
     assert.equal(url,'https://ai-gateway.kilo.ai/api/v1/chat/completions');
    }
    return reply(fakeBody(provider));
   }});
   assert.equal(hits,1,'no fallback or additional request');
   assert.equal(result.status,'PASSED',provider);
   assert.equal(result.score,5);
   assert.deepEqual(result.cases.map(x=>x.correct),[true,true,true,true,true]);
   assert.ok(!JSON.stringify(result).includes('test-kilo'),'credentials must never be returned');
  }
 });
});

test('partial, wrong and malformed financial results never become full success',()=>{
 const partial=classifyFinancialAccuracyResponse(fakeBody('groq',{...expected,D2:740,D4:772}),'groq');
 assert.equal(partial.status,'PARTIAL');
 assert.equal(partial.score,3);
 assert.deepEqual(partial.cases.filter(x=>!x.correct).map(x=>x.id),['D2','D4']);
 const incorrect=classifyFinancialAccuracyResponse(fakeBody('groq',{D1:1,D2:2,D3:3,D4:4,D5:5}),'groq');
 assert.equal(incorrect.status,'WRONG_ANSWER');
 assert.equal(incorrect.score,0);
 const extra=classifyFinancialAccuracyResponse(fakeBody('groq',{...expected,customerData:3}),'groq');
 assert.equal(extra.status,'ANSWER_FORMAT');
 const strings=classifyFinancialAccuracyResponse(fakeBody('groq',{...expected,D1:'214.2'}),'groq');
 assert.equal(strings.status,'ANSWER_FORMAT');
 const stopped=classifyFinancialAccuracyResponse({choices:[{finish_reason:'length',message:{content:JSON.stringify(expected)}}]},'kilo');
 assert.equal(stopped.status,'OUTPUT_TRUNCATED');
 const blocked=classifyFinancialAccuracyResponse({choices:[{finish_reason:'content_filter',message:{content:''}}]},'groq');
 assert.equal(blocked.status,'OUTPUT_BLOCKED');
 const upstream=classifyFinancialAccuracyResponse({error:{message:'never return upstream error body'}},'groq');
 assert.equal(upstream.status,'PROVIDER_ERROR');
 assert.ok(!JSON.stringify(upstream).includes('never return'));
});

test('unknown diagnostic modes cannot call any provider',async()=>{
 await withSyntheticKeys(async()=>{
  let hits=0;
  const out=await runSyntheticProviderDiagnostic('groq',{mode:'paid',fetchImpl:async()=>{hits++;throw Error('unexpected');}});
  assert.equal(out.status,'INVALID_DIAGNOSTIC_MODE');
  assert.equal(hits,0);
 });
});

test('admin-only UI requires manual click and protected Firebase UID before grading',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const ui=read('public/health.html'),script=read('public/health.js'),core=read('api/ai-core.js');
 assert.match(ui,/<main hidden>/);
 assert.match(script,/if\(!await ownerPermission\(\)\)/);
 for(const provider of SYNTHETIC_PROVIDER_IDS){
  assert.ok(ui.includes('data-provider-accuracy="'+provider+'"'));
  assert.ok(ui.includes('data-accuracy-result="'+provider+'"'));
 }
 assert.match(script,/button\.addEventListener\('click',async\(\)=>/);
 assert.match(script,/body:JSON\.stringify\(alternativeModel!==null\?/);
 assert.match(script,/\{provider,mode:'financial',model:alternativeModel\}/);
 assert.match(script,/\{provider,mode:'financial'\}/);
 const start=core.indexOf("if(request.headers['x-lourex-admin-diagnostics']==='provider-probe')");
 const end=core.indexOf("  if(!rateAllowed(request))",start);
 const gate=core.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.ok(gate.indexOf('diagnosticsOwnerUidAllowed(')<gate.indexOf('runSyntheticProviderDiagnostic(provider,{mode})'));
 assert.ok(gate.includes("mode!=='single'&&mode!=='financial'"));
});

test('owner financial diagnostics render one case per line and preserve mobile bidirectional legibility',()=>{
 const html=readFileSync(new URL('../public/health.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('../public/health.js',import.meta.url),'utf8');
 assert.match(html,/\.provider-probe-result\{[^}]*white-space:pre-line/);
 assert.match(html,/\.provider-probe-result\{[^}]*unicode-bidi:plaintext/);
 assert.ok(script.includes("details.join('\\n')"),'five calculations must not be squeezed into one inline sentence');
 assert.ok(script.includes("data.score===5?' ✓':' — Review required"));
 assert.ok(script.includes('Not a production accounting certification'));
});
