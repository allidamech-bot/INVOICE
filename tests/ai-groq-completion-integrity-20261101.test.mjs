/**
 * Groq's JSON grammar and the application schema both can accept a partial
 * value if max_completion_tokens was exhausted AFTER closing the JSON.
 * Never treat such a reply or phantom tool_calls as completed work.
 * All replies and keys here are local synthetic fixtures. No network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const keys=[
  'GROQ_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID',
  'GEMINI_API_KEY','OPENROUTER_API_KEY','OLLAMA_API_KEY',
  'LOUREX_AI_MULTI_MODEL_ENABLED','LOUREX_AI_NEW_PROVIDERS_ENABLED',
];
const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const originalFetch=globalThis.fetch;
let seq=0;
test.afterEach(()=>{
  globalThis.fetch=originalFetch;
  for(const key of keys){
    if(before[key]===undefined)delete process.env[key];
    else process.env[key]=before[key];
  }
});
const onlyGroq=()=>{
  for(const key of keys)delete process.env[key];
  process.env.GROQ_API_KEY='offline-synthetic-test-key';
};
const request={
  taskType:'business_copilot',prompt:'Hypothetical data only. Do not save.',
  schema:{type:'OBJECT',properties:{answer:{type:'STRING'}},required:['answer']},
  maxOutputTokens:256,totalBudgetMs:12000,
};
const response=(value,finish_reason='stop',extra={})=>({
  ok:true,status:200,
  headers:{get:()=>null},
  text:async()=>JSON.stringify({choices:[{
    finish_reason,
    message:{content:JSON.stringify({answer:value}),...extra},
  }]}),
});
const route=async()=>(
  await import('../api/_ai/router.js?completion-integrity='+ ++seq)
).routeAiStructured;

test('Groq explicit truncation/filter/tool finish is never a successful conversation',async()=>{
  for(const finish of ['length','max_tokens','tool_calls']){
    onlyGroq();let calls=0;
    globalThis.fetch=async(url,options)=>{
      calls++;
      assert.match(url,/api\.groq\.com/u);
      assert.equal(JSON.parse(options.body).tool_choice,'none');
      return response('Partial JSON value that looked complete',finish);
    };
    const result=await (await route())(request);
    assert.equal(result.success,false,finish);
    assert.equal(result.errorCode,'AI_INVALID_RESULT',finish);
    assert.equal(result.attemptCount,1,finish);
    assert.equal(calls,1,'no hidden retry');
  }
});

test('Groq tool calls are forbidden even if the upstream says finish_reason=stop',async()=>{
  onlyGroq();let calls=0;
  globalThis.fetch=async()=>{
    calls++;
    return response('Do not accept this', 'stop', {
      tool_calls:[{id:'synthetic-call',type:'function',
        function:{name:'approve_invoice',arguments:'{}'}}],
    });
  };
  const result=await (await route())(request);
  assert.equal(result.success,false);
  assert.equal(result.errorCode,'AI_INVALID_RESULT');
  assert.equal(calls,1);
});

test('An accepted complete Groq response still works with strict JSON',async()=>{
  onlyGroq();let calls=0;
  globalThis.fetch=async(_url,options)=>{
    calls++;const body=JSON.parse(options.body);
    assert.equal(body.response_format.json_schema.strict,true);
    assert.equal(body.tool_choice,'none');
    return response('Understood, no changes made');
  };
  const result=await (await route())(request);
  assert.equal(result.success,true);
  assert.equal(result.data.answer,'Understood, no changes made');
  assert.equal(result.provider,'groq');
  assert.equal(calls,1);
});

test('Rejected truncated Groq JSON falls back only to an existing approved provider',async()=>{
  onlyGroq();
  process.env.CLOUDFLARE_ACCOUNT_ID='offline-synthetic-account';
  process.env.CLOUDFLARE_AI_API_TOKEN='offline-synthetic-cloudflare-key';
  const urls=[];
  globalThis.fetch=async(url,options)=>{
    urls.push(String(url));const body=JSON.parse(options.body);
    assert.equal(body.messages[0].content,request.prompt,'unchanged synthetic prompt');
    return String(url).includes('groq.com')
      ?response('Incomplete from Groq','length')
      :response('Fully reviewed from Cloudflare');
  };
  const result=await (await route())(request);
  assert.equal(result.success,true);
  assert.equal(result.provider,'cloudflare');
  assert.equal(result.data.answer,'Fully reviewed from Cloudflare');
  assert.equal(result.fallbackUsed,true);
  assert.equal(result.attemptCount,2);
  assert.equal(urls.length,2);
});

test('Groq content_filter blocks the whole request and cannot be bypassed by another vendor',async()=>{
  onlyGroq();
  process.env.CLOUDFLARE_ACCOUNT_ID='offline-account';
  process.env.CLOUDFLARE_AI_API_TOKEN='offline-cloudflare-key';
  let calls=0;
  globalThis.fetch=async url=>{
    calls++;
    assert.match(String(url),/api\.groq\.com/u,'no external fallback after a block');
    return response('A partial but valid-looking JSON','content_filter');
  };
  const events=[];
  const result=await (await route())({...request,onDiagnostic:e=>events.push(e)});
  assert.equal(result.success,false);
  assert.equal(result.errorCode,'AI_OUTPUT_BLOCKED');
  assert.equal(events.length,1);
  assert.equal(events[0].category,'blocked');
  assert.doesNotMatch(JSON.stringify(events),/offline-synthetic|partial but valid-looking/i);
  assert.equal(result.attemptCount,1);
  assert.equal(calls,1);
  const {aiRouterPublicError}=await import('../api/_ai/router.js');
  const publicError=aiRouterPublicError(result);
  assert.equal(publicError.status,422);
  assert.equal(publicError.code,'AI_OUTPUT_BLOCKED');
  assert.match(publicError.message,/No operation was executed/u);
});
