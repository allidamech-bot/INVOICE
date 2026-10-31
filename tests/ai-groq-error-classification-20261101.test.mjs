/**
 * LOUREX legacy AI-only Groq error classification tests.
 * All upstream calls are in-memory synthetic fixtures. No credentials,
 * real inference, financial writes, feature changes or deployments.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const environmentKeys=[
  'GROQ_API_KEY','CLOUDFLARE_AI_API_TOKEN','CLOUDFLARE_ACCOUNT_ID',
  'GEMINI_API_KEY','OPENROUTER_API_KEY','OLLAMA_API_KEY',
  'LOUREX_AI_MULTI_MODEL_ENABLED','LOUREX_AI_NEW_PROVIDERS_ENABLED',
];
let caseNo=0;
async function runFixture({status,errorCode,upstreamCode,message,headers={}}){
  const saved=Object.fromEntries(environmentKeys.map(k=>[k,process.env[k]]));
  const originalFetch=globalThis.fetch;
  let calls=0;const diagnostics=[];
  try{
    for(const key of environmentKeys)delete process.env[key];
    process.env.GROQ_API_KEY='synthetic-test-key-never-sent-over-network';
    globalThis.fetch=async(url,options)=>{
      calls++;
      assert.match(String(url),/^https:\/\/api\.groq\.com\//u);
      assert.equal(JSON.parse(options.body).model,'openai/gpt-oss-120b');
      return{
        ok:false,status,
        headers:{get:name=>headers[name.toLowerCase()]??null},
        text:async()=>JSON.stringify({error:{
          code:upstreamCode,
          message:message??'PRIVATE-UPSTREAM-DETAIL',
          failed_generation:'PRIVATE-DRAFT-CONTENT-NEVER-LOG',
        }}),
      };
    };
    const {routeAiStructured,aiRouterPublicError}=await import(
      '../api/_ai/router.js?groq-classification='+ ++caseNo
    );
    const result=await routeAiStructured({
      taskType:'business_copilot',prompt:'SYNTHETIC-NO-BUSINESS-DATA',
      schema:{type:'OBJECT',properties:{value:{type:'STRING'}},required:['value']},
      maxOutputTokens:256,totalBudgetMs:12000,
      onDiagnostic:datum=>diagnostics.push(datum),
    });
    assert.equal(result.success,false);
    assert.equal(result.errorCode,errorCode);
    assert.equal(result.attemptCount,1,'never retry identical rejected request');
    assert.equal(calls,1,'never dispatch to another endpoint');
    assert.equal(diagnostics.length,1);
    assert.equal(diagnostics[0].provider,'groq');
    assert.equal(diagnostics[0].model,'openai/gpt-oss-120b');
    assert.doesNotMatch(JSON.stringify(diagnostics),/PRIVATE|synthetic-test-key|SYNTHETIC-NO-BUSINESS-DATA|failed_generation/u);
    return {result,diagnostics:diagnostics[0],public:aiRouterPublicError(result)};
  }finally{
    globalThis.fetch=originalFetch;
    for(const k of environmentKeys){
      if(saved[k]===undefined)delete process.env[k];
      else process.env[k]=saved[k];
    }
  }
}

test('Groq 413 rate_limit_exceeded: permanent per-request oversize, no 429 cooldown',async()=>{
  const out=await runFixture({
    status:413,upstreamCode:'rate_limit_exceeded',
    errorCode:'AI_REQUEST_TOO_LARGE',
  });
  assert.equal(out.diagnostics.category,'oversize');
  assert.equal(out.public.status,413);
  assert.equal(out.public.code,'AI_REQUEST_TOO_LARGE');
  assert.match(out.public.message,/Reduce the request size/u);
});

test('Groq 400 tool_use_failed: distinct generated-action failure, no content leakage',async()=>{
  const out=await runFixture({
    status:400,upstreamCode:'tool_use_failed',
    errorCode:'AI_TOOL_GENERATION_FAILED',
  });
  assert.equal(out.diagnostics.category,'invalid');
  assert.deepEqual(out.diagnostics.rejection,{
    status:400,code:'tool_use_failed',param:'unknown',fields:[],
  });
  assert.equal(out.public.status,502);
  assert.match(out.public.message,/No action was executed/u);
});

test('Groq 429 remains transient rate limiting, respects retry-after, no repeat',async()=>{
  const out=await runFixture({
    status:429,upstreamCode:'rate_limit_exceeded',
    errorCode:'AI_RATE_LIMITED',
    headers:{'retry-after':'45'},
  });
  assert.equal(out.diagnostics.category,'rate_limit');
  assert.equal(out.diagnostics.retryAfterMs,45_000);
  assert.equal(out.public.status,429);
});
