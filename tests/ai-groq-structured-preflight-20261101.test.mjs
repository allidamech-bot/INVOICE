/**
 * Offline synthetic Groq request-shaping acceptance for legacy LOUREX AI.
 * No API keys, actual providers, real finance data or deployment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const envKeys=[
  'GROQ_API_KEY','GEMINI_API_KEY','CLOUDFLARE_AI_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID','OPENROUTER_API_KEY','OLLAMA_API_KEY',
  'LOUREX_AI_MULTI_MODEL_ENABLED','LOUREX_AI_NEW_PROVIDERS_ENABLED',
];
const initialEnv=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
const originalFetch=globalThis.fetch;
let sequence=0;
function restore(){
  globalThis.fetch=originalFetch;
  for(const k of envKeys){
    if(initialEnv[k]===undefined)delete process.env[k];
    else process.env[k]=initialEnv[k];
  }
}
test.afterEach(restore);
function groqOnly(){
  for(const k of envKeys)delete process.env[k];
  process.env.GROQ_API_KEY='offline-never-send-test-token';
}
function schema(properties={answer:{type:'STRING'}},required=Object.keys(properties)){
  return {type:'OBJECT',properties,required};
}
function mock(status,content){
  return {ok:status>=200&&status<300,status,
    headers:{get:()=>null},
    text:async()=>JSON.stringify(status===200?
      {choices:[{message:{content:JSON.stringify(content)}}]}:
      {error:{code:'tool_use_failed',message:'synthetic'}})};
}
const router=async()=>{
  const mod=await import('../api/_ai/router.js?groq-preflight='+ ++sequence);
  return mod.routeAiStructured;
};
const request=(prompt,extras={})=>({
  taskType:'business_copilot',prompt,schema:schema(),
  maxOutputTokens:1536,...extras,
});

test('strict JSON applies to a closed one-field dialogue contract, without tool calls',async()=>{
  groqOnly();const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),body:JSON.parse(options.body)});
    return mock(200,{answer:'فهمت المثال دون حفظ أو تعديل'});
  };
  const run=await router(),r=await run(request('مثال افتراضي فقط، لا تحفظ شيئاً'));
  assert.equal(r.success,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.model,'openai/gpt-oss-120b');
  assert.equal(calls[0].body.response_format.json_schema.strict,true);
  assert.equal(calls[0].body.tool_choice,'none');
  assert.equal(calls[0].body.max_completion_tokens,1536);
  assert.equal(calls[0].body.tools,undefined);
});

test('optional/incomplete or advanced JSON schema must not be automatically forced strict',async()=>{
  groqOnly();const bodies=[];
  globalThis.fetch=async(_url,options)=>{
    bodies.push(JSON.parse(options.body));return mock(200,{answer:'ok'});
  };
  const run=await router();
  const optional=schema({answer:{type:'STRING'},optional:{type:'STRING'}},['answer']);
  const advanced=schema({answer:{type:'STRING',maxLength:500}});
  for(const candidate of [optional,advanced]){
    const r=await run(request('Only a hypothetical test', {schema:candidate}));
    assert.equal(r.success,true);
  }
  assert.equal(bodies.length,2);
  assert.deepEqual(bodies.map(b=>b.response_format.json_schema.strict),
    [false,false]);
  assert.ok(bodies.every(b=>b.tool_choice==='none'));
});

test('oversized text request fails before any model call, without cutting user context',async()=>{
  groqOnly();let network=0;
  globalThis.fetch=async()=>{network++;throw Error('NETWORK_FORBIDDEN');};
  const run=await router();
  const original='افتراضي '.repeat(1600);
  const result=await run(request(original));
  assert.equal(result.success,false);
  assert.equal(result.errorCode,'AI_REQUEST_TOO_LARGE');
  assert.equal(result.attemptCount,0);
  assert.equal(network,0);
});

test('oversized Groq request can use an already allowed free fallback, unchanged prompt',async()=>{
  groqOnly();
  process.env.CLOUDFLARE_ACCOUNT_ID='offline-account';
  process.env.CLOUDFLARE_AI_API_TOKEN='offline-cloudflare-key';
  const text='Arabic synthetic scenario '.repeat(900),urls=[],bodies=[];
  globalThis.fetch=async(url,options)=>{
    urls.push(String(url));bodies.push(JSON.parse(options.body));
    return mock(200,{answer:'safe synthetic response'});
  };
  const run=await router(),r=await run(request(text));
  assert.equal(r.success,true);
  assert.equal(r.provider,'cloudflare');
  assert.equal(r.attemptCount,1);
  assert.equal(urls.length,1);
  assert.match(urls[0],/cloudflare\.com/u);
  assert.equal(bodies[0].messages[0].content,text);
});

test('Groq text preflight never switches to a paid provider or discards text',async()=>{
  groqOnly();
  process.env.OPENROUTER_API_KEY='offline-openrouter-key';
  process.env.LOUREX_AI_NEW_PROVIDERS_ENABLED='true';
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('NETWORK_FORBIDDEN');};
  const run=await router();
  const result=await run(request('private example '.repeat(1600)));
  assert.equal(result.success,false);
  assert.equal(result.errorCode,'AI_REQUEST_TOO_LARGE');
  assert.equal(calls,0);
});

test('normal greeting with sizeable synthetic catalogue is not falsely blocked by UTF-8 byte length',async()=>{
  groqOnly();let calls=0;
  const {buildNaturalLourexPrompt}=await import('../api/_ai/lourex-dialogue.js');
  const rows=Array.from({length:25},(_,i)=>({
    name:'Synthetic catalogue item '+(i+1),sku:'ITEM-'+i,
    price:100+i,currency:'USD',stock:i
  }));
  const prompt=buildNaturalLourexPrompt({
    message:'السلام عليكم',
    context:{language:'ar',screen:'home',
      finance:{asOf:'2026-11-10',balance:0},
      business:{products:{rows}},pricing:{rows},drafting:{},workingMemory:''}
  });
  assert.ok(Buffer.byteLength(prompt,'utf8')>8000,'repro: prompt uses more than 8K bytes but can still fit 8K tokens');
  globalThis.fetch=async(_url,options)=>{
    calls++;
    assert.equal(JSON.parse(options.body).messages[0].content,prompt,
      'no customer context or prompt is silently removed');
    return mock(200,{answer:'وعليكم السلام'});
  };
  const result=await (await router())(request(prompt));
  assert.equal(result.success,true);
  assert.equal(result.data.answer,'وعليكم السلام');
  assert.equal(calls,1);
});

test('provider failure codes remain visible rather than collapsing into generic 503',()=>{
  const client=readFileSync(new URL('../src/lib/ai-request.ts',import.meta.url),'utf8');
  const generic=client.indexOf("if(code==='AI_TEMPORARILY_UNAVAILABLE'||status===503)");
  assert.ok(generic>0);
  for(const code of ['AI_REQUEST_TOO_LARGE','AI_TOOL_GENERATION_FAILED',
    'AI_OUTPUT_BLOCKED','AI_INVALID_RESULT']){
    const position=client.indexOf("if(code==='"+code+"')");
    assert.ok(position>0&&position<generic,
      code+' must be translated before the generic HTTP 503 fallback');
  }
});
