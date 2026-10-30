import test from 'node:test';
import assert from 'node:assert/strict';
import {
  R07Q_PROVIDER_ROUTING_ACTIVE,rankR07QTaskModel,routeR07QOffline,
} from '../../dist/src/ai-next/router/task-aware-model-router.js';
import {R05HealthBook,R05ProviderFailure}
  from '../../dist/src/ai-next/router/gateway.js';
const scope={
  ownerUid:'owner-r07q',accountId:'account-r07q',companyId:'company-r07q',
  branchId:'branch-r07q',threadId:'thread-r07q',actorId:'owner-r07q',
  role:'owner',scopeType:'business',authorizationVersion:1,
};
const good={action:'discuss',subject:null,reference:'none',
  facts:[],sourceIds:[],missingFields:[]};
const model=(overrides={})=>({
  providerId:'provider-fixture',modelId:'fixture-basic',registryVersion:'recorded',
  capabilities:['TEXT','STRUCTURED_OUTPUT','DEEP_REASONING','LARGE_CONTEXT'],
  inputModalities:['text'],contextWindow:8192,maxImages:0,maxPages:null,
  providerEnabled:true,credentialsPresent:true,accountFreeVerified:true,
  modelZeroCostVerified:true,quotaAvailable:true,privacyApproved:true,
  healthAvailable:true,qualityTier:'basic',quotaGroupId:'fixture-account',
  ...overrides,
});
const needs=(overrides={})=>({
  taskType:'draft_modification',inputModalities:['text'],inputEstimateTokens:50,
  requiredOutputSchema:'json_v1',privacyClass:'public_synthetic',
  imageCount:0,pageCount:0,deadlineMs:4000,...overrides,
});
const offline=(invoke)=>({transportKind:'offline_synthetic_fixture',invoke});
const request=(overrides={})=>({
  scope,needs:needs(),models:[model()],
  payload:Object.freeze({synthetic:true,utterance:'change quantity'}),
  transport:offline(async()=>good),...overrides,
});
test('R07Q remains disabled with no production routes or remote transport',()=>{
  assert.equal(R07Q_PROVIDER_ROUTING_ACTIVE,false);
});
test('local command categories do not invoke any transport',async()=>{
  let calls=0;
  for(const taskType of ['local_greeting','local_draft_start','unsupported']){
    const result=await routeR07QOffline(request({
      needs:needs({taskType}),transport:offline(async()=>{calls++;return good;}),
    }));
    assert.equal(result.ok,false);assert.equal(result.attempts,0);
  }
  assert.equal(calls,0);
});
test('task-aware simple request prefers trusted basic capability over advanced',async()=>{
  const called=[];
  const output=await routeR07QOffline(request({
    models:[model({modelId:'advanced',qualityTier:'advanced'}),
      model({providerId:'second-fixture',modelId:'basic'})],
    transport:offline(async({model:m})=>{
      called.push(m.modelId);return good;
    }),
  }));
  assert.equal(output.ok,true);
  assert.equal(output.modelId,'basic');
  assert.deepEqual(called,['basic']);
});
test('complex document comparison prefers verified advanced eligible model',async()=>{
  const called=[];
  const output=await routeR07QOffline(request({
    needs:needs({taskType:'document_comparison'}),
    models:[model(),model({providerId:'other',modelId:'advanced',
      qualityTier:'advanced'})],
    transport:offline(async({model:m})=>{
      called.push(m.modelId);return good;
    }),
  }));
  assert.equal(output.ok,true);
  assert.equal(output.modelId,'advanced');
  assert.deepEqual(called,['advanced']);
});
test('structured text extraction favors capable model without forcing most costly tier',async()=>{
  const output=await routeR07QOffline(request({
    needs:needs({taskType:'structured_extraction'}),
    models:[model(),model({modelId:'capable',providerId:'other',qualityTier:'capable'}),
      model({modelId:'advanced',providerId:'third',qualityTier:'advanced'})],
  }));
  assert.equal(output.ok,true);assert.equal(output.modelId,'capable');
});
test('unverified free pricing, missing key, exhausted quota, denied privacy never call',async()=>{
  const invalid=[
    {modelZeroCostVerified:false},{accountFreeVerified:false},
    {credentialsPresent:false},{quotaAvailable:false},
    {privacyApproved:false},{providerEnabled:false},
    {healthAvailable:false},
  ];
  for(const bad of invalid){
    let calls=0;
    const outcome=await routeR07QOffline(request({
      models:[model(bad)],
      transport:offline(async()=>{calls++;return good;}),
    }));
    assert.equal(outcome.ok,false,JSON.stringify(bad));
    assert.equal(outcome.attempts,0);
    assert.equal(calls,0);
  }
});
test('not one-model-per-provider: all individually verified models can be considered',async()=>{
  const seen=[];
  const models=[model({modelId:'first',qualityTier:'advanced'}),
    model({modelId:'second',qualityTier:'capable'}),
    model({modelId:'third',qualityTier:'basic'})];
  const result=await routeR07QOffline(request({
    needs:needs({taskType:'document_comparison'}),
    models,transport:offline(async({model:m})=>{
      seen.push(m.modelId);
      if(m.modelId!=='third')throw new R05ProviderFailure('upstream');
      return good;
    }),
  }));
  assert.equal(result.ok,true);
  assert.equal(result.attempts,3);
  assert.deepEqual(seen,['first','second','third']);
});
test('strict semantic candidate validation rejects malformed success then falls back',async()=>{
  const called=[];
  const result=await routeR07QOffline(request({
    models:[model({modelId:'basic-1',qualityTier:'basic'}),
      model({modelId:'basic-2',providerId:'backup',qualityTier:'capable'})],
    transport:offline(async({model:m})=>{
      called.push(m.modelId);
      return m.modelId==='basic-1'?{...good,financialSaved:true}:good;
    }),
  }));
  assert.equal(result.ok,true);
  assert.equal(result.fallbackUsed,true);
  assert.equal(result.observations[0].category,'invalid_result');
  assert.equal(result.attempts,2);
  assert.deepEqual(called,['basic-1','basic-2']);
});
test('all malformed outputs fail with explicit invalid result, never false success',async()=>{
  const result=await routeR07QOffline(request({
    models:[model()],
    transport:offline(async()=>({action:'execute_approved',executed:true})),
  }));
  assert.equal(result.ok,false);
  assert.equal(result.code,'R05_INVALID_RESULT');
  assert.equal(result.observations[0].category,'invalid_result');
});
test('shared provider cooldown skips same-provider alternatives after 429',async()=>{
  const called=[];
  const result=await routeR07QOffline(request({
    needs:needs({taskType:'document_comparison'}),
    models:[model({modelId:'advanced',qualityTier:'advanced'}),
      model({modelId:'capable',qualityTier:'capable'}),
      model({providerId:'backup',modelId:'backup',qualityTier:'basic'})],
    transport:offline(async({model:m})=>{
      called.push(m.modelId);
      if(m.providerId!=='backup')throw new R05ProviderFailure('rate_limit','provider',60000);
      return good;
    }),
  }));
  assert.equal(result.ok,true);
  assert.deepEqual(called,['advanced','backup']);
  assert.equal(result.observations[0].category,'rate_limit');
});
test('persistent health opens circuit after two failures, skipping broken model',async()=>{
  let now=1_000_000;
  const health=new R05HealthBook(()=>now);
  const called=[];
  const mods=[model({modelId:'broken',qualityTier:'advanced'}),
    model({modelId:'backup',providerId:'backup',qualityTier:'capable'})];
  const args=request({
    needs:needs({taskType:'document_comparison'}),models:mods,health,now:()=>now,
    transport:offline(async({model:m})=>{
      called.push(m.modelId);
      if(m.modelId==='broken')throw new R05ProviderFailure('upstream');
      return good;
    }),
  });
  for(let i=0;i<3;i++)assert.equal((await routeR07QOffline(args)).ok,true);
  assert.deepEqual(called,['broken','backup','broken','backup','backup']);
  now+=31_000;
  assert.equal((await routeR07QOffline(args)).ok,true);
  assert.equal(called.at(-2),'broken');
  assert.equal(called.at(-1),'backup');
});
test('shared overall deadline and prior cancellation block any provider attempts',async()=>{
  let calls=0;
  const tooShort=await routeR07QOffline(request({
    needs:needs({deadlineMs:10}),
    transport:offline(async()=>{calls++;return good;}),
  }));
  assert.equal(tooShort.ok,false);
  const stop=new AbortController();stop.abort();
  const cancelled=await routeR07QOffline(request({
    signal:stop.signal,
    transport:offline(async()=>{calls++;return good;}),
  }));
  assert.equal(cancelled.code,'R05_CANCELLED');
  assert.equal(calls,0);
});
test('private/confidential payload and missing offline transport marker fail closed',async()=>{
  for(const privacyClass of ['internal_business','confidential']){
    await assert.rejects(routeR07QOffline(request({
      needs:needs({privacyClass}),
    })),/R07Q_PRIVATE_OR_NONSTRUCTURED_INPUT_DENIED/);
  }
  await assert.rejects(routeR07QOffline(request({
    needs:needs({requiredOutputSchema:'none'}),
  })),/R07Q_PRIVATE_OR_NONSTRUCTURED_INPUT_DENIED/);
  await assert.rejects(routeR07QOffline(request({
    transport:{invoke:async()=>good},
  })),/R07Q_OFFLINE_AUTHORIZATION_REQUIRED/);
});
test('oversized registry is rejected instead of silently truncating untrusted input',async()=>{
  const models=Array.from({length:301},(_,i)=>model({modelId:'m'+i}));
  await assert.rejects(routeR07QOffline(request({models})),
    /R07Q_MODEL_POOL_BOUND_EXCEEDED/);
});
test('no schema-compatible model means no provider attempts',async()=>{
  let calls=0;
  const output=await routeR07QOffline(request({
    models:[model({capabilities:['TEXT']})],
    transport:offline(async()=>{calls++;return good;}),
  }));
  assert.equal(output.code,'R05_NO_ELIGIBLE_MODELS');
  assert.equal(calls,0);
});
test('known latency/health evidence can outweigh initial tier selection safely',()=>{
  let clock=1_000_000;
  const health=new R05HealthBook(()=>clock);
  const fast=model({modelId:'fast',qualityTier:'capable'});
  const flaky=model({modelId:'flaky',qualityTier:'advanced'});
  for(let i=0;i<3;i++){
    health.observe(fast,true,80);
    health.observe(flaky,false,4000,new R05ProviderFailure('upstream'));
  }
  const rankFast=rankR07QTaskModel(fast,health,'document_comparison');
  const rankFlaky=rankR07QTaskModel(flaky,health,'document_comparison');
  assert.ok(Number.isFinite(rankFast)&&Number.isFinite(rankFlaky));
  assert.ok(rankFast>rankFlaky);
});
