import test from 'node:test';
import assert from 'node:assert/strict';
import {routeR07QOfflineSemantic,R07Q_SEMANTIC_BRIDGE_ACTIVE}
  from '../../dist/src/ai-next/router/offline-semantic-route.js';
import {R05ProviderFailure,R05HealthBook}
  from '../../dist/src/ai-next/router/gateway.js';

const scope={ownerUid:'synthetic-owner',actorId:'synthetic-owner',
  accountId:'synthetic-account',companyId:'synthetic-company',
  branchId:'synthetic-branch',threadId:'synthetic-thread',
  role:'owner',scopeType:'business',authorizationVersion:1};
const candidate={action:'edit_draft',subject:null,reference:'active_draft',
  facts:[{name:'quantity',value:'12'}],sourceIds:[],missingFields:[]};
const model=(changes={})=>({
  providerId:'fake-provider',modelId:'fake-model',registryVersion:'fixture-v1',
  capabilities:['TEXT','STRUCTURED_OUTPUT','DEEP_REASONING','LARGE_CONTEXT'],
  inputModalities:['text'],contextWindow:64000,maxImages:0,maxPages:null,
  providerEnabled:true,credentialsPresent:true,accountFreeVerified:true,
  modelZeroCostVerified:true,quotaAvailable:true,privacyApproved:true,
  healthAvailable:true,qualityTier:'capable',quotaGroupId:'fake-account',
  ...changes,
});
const needs=(changes={})=>({
  taskType:'general_conversation',inputModalities:['text'],inputEstimateTokens:100,
  requiredOutputSchema:'json_v1',privacyClass:'public_synthetic',
  imageCount:0,pageCount:0,deadlineMs:4000,...changes,
});
const offline=fn=>({transportKind:'offline_synthetic_fixture',invoke:fn});
const request=(changes={})=>({
  scope,models:[model()],needs:needs(),
  fixture:{testOnly:true,fixtureId:'synthetic-arabic-01',
    utterance:'لا خلي الكمية 12 بدل 10'},
  transport:offline(async()=>candidate),...changes,
});
test('R07Q semantic bridge remains inactive and never mounts an endpoint',()=>{
  assert.equal(R07Q_SEMANTIC_BRIDGE_ACTIVE,false);
});
test('simple language follows R05 existing task fit, without a second ranker',async()=>{
  const calls=[];
  const out=await routeR07QOfflineSemantic(request({
    models:[model({modelId:'advanced',qualityTier:'advanced'}),
      model({modelId:'capable',providerId:'backup',qualityTier:'capable'}),
      model({modelId:'basic',providerId:'basic-provider',qualityTier:'basic'})],
    transport:offline(async({model:m,payload})=>{
      assert.equal(payload.testOnly,true);
      calls.push(m.modelId);return candidate;
    }),
  }));
  assert.equal(out.ok,true);
  assert.equal(out.modelId,'capable');
  assert.deepEqual(calls,['capable']);
});
test('complex document reasoning follows existing verified advanced preference',async()=>{
  const out=await routeR07QOfflineSemantic(request({
    needs:needs({taskType:'document_comparison'}),
    models:[model({modelId:'basic',qualityTier:'basic'}),
      model({modelId:'advanced',qualityTier:'advanced',providerId:'advanced-provider'})],
  }));
  assert.equal(out.ok,true);
  assert.equal(out.modelId,'advanced');
});
test('simple local commands consume zero model attempts',async()=>{
  let calls=0;
  for(const taskType of ['local_greeting','local_draft_start','unsupported']){
    const out=await routeR07QOfflineSemantic(request({
      needs:needs({taskType}),transport:offline(async()=>{
        calls++;return candidate;}),
    }));
    assert.equal(out.attempts,0);
    assert.equal(out.ok,false);
  }
  assert.equal(calls,0);
});
test('candidate schema rejects forged success and retries a second eligible model',async()=>{
  const called=[];
  const out=await routeR07QOfflineSemantic(request({
    models:[model({modelId:'capable'}),
      model({modelId:'advanced',providerId:'backup',qualityTier:'advanced'})],
    transport:offline(async({model:m})=>{
      called.push(m.modelId);
      return m.modelId==='capable'?{...candidate,financialSaved:true}:candidate;
    }),
  }));
  assert.equal(out.ok,true);
  assert.deepEqual(called,['capable','advanced']);
  assert.equal(out.fallbackUsed,true);
  assert.equal(out.observations[0].category,'invalid_result');
});
test('no fabricated success if every candidate produces untrusted malformed JSON',async()=>{
  const out=await routeR07QOfflineSemantic(request({
    transport:offline(async()=>({text:'تم حفظ الفاتورة',success:true})),
  }));
  assert.equal(out.ok,false);
  assert.equal(out.code,'R05_INVALID_RESULT');
  assert.equal(out.attempts,1);
});
test('dynamic pool can consider multiple eligible models on same provider',async()=>{
  const seen=[];
  const out=await routeR07QOfflineSemantic(request({
    models:[model({modelId:'m1'}),
      model({modelId:'m2',qualityTier:'basic'}),
      model({modelId:'m3',qualityTier:'advanced'})],
    transport:offline(async({model:m})=>{
      seen.push(m.modelId);
      if(m.modelId==='m3')return candidate;
      throw new R05ProviderFailure('upstream');
    }),
  }));
  assert.equal(out.ok,true);
  assert.equal(out.attempts,3);
  assert.deepEqual(seen,['m1','m2','m3']);
});
test('invalid cost, credentials, privacy, provider state and quota call no model',async()=>{
  for(const bad of [
    {modelZeroCostVerified:false},{accountFreeVerified:false},
    {credentialsPresent:false},{providerEnabled:false},
    {quotaAvailable:false},{privacyApproved:false},{healthAvailable:false},
  ]){
    let calls=0;
    const out=await routeR07QOfflineSemantic(request({
      models:[model(bad)],
      transport:offline(async()=>{calls++;return candidate;}),
    }));
    assert.equal(out.ok,false,JSON.stringify(bad));
    assert.equal(out.attempts,0);
    assert.equal(calls,0);
  }
});
test('runtime privacy revocation aborts remaining providers without leaked error',async()=>{
  let calls=0;
  const out=await routeR07QOfflineSemantic(request({
    models:[model(),model({providerId:'backup',modelId:'backup-model'})],
    transport:offline(async()=>{calls++;
      throw new R05ProviderFailure('privacy_denied');}),
  }));
  assert.equal(out.ok,false);
  assert.equal(out.code,'R05_PRIVACY_DENIED');
  assert.equal(calls,1);
  assert.equal(out.observations[0].category,'privacy_denied');
});
test('rate-limit provider cooldown skips same-provider alternatives',async()=>{
  const seen=[];
  const out=await routeR07QOfflineSemantic(request({
    models:[model({modelId:'first'}),
      model({modelId:'second',qualityTier:'basic'}),
      model({providerId:'backup',modelId:'third',qualityTier:'basic'})],
    transport:offline(async({model:m})=>{
      seen.push(m.modelId);
      if(m.providerId!=='backup')
        throw new R05ProviderFailure('rate_limit','provider',60000);
      return candidate;
    }),
  }));
  assert.equal(out.ok,true);
  assert.deepEqual(seen,['first','third']);
});
test('authentication, region and quota failures use inherited R05 cooldowns',async()=>{
  for(const kind of ['authentication','region_denied','quota_exhausted']){
    const seen=[];
    const out=await routeR07QOfflineSemantic(request({
      models:[model({modelId:'a'}),model({modelId:'b',qualityTier:'basic'}),
        model({modelId:'c',providerId:'backup',qualityTier:'basic'})],
      transport:offline(async({model:m})=>{
        seen.push(m.modelId);
        if(m.providerId!=='backup')throw new R05ProviderFailure(kind);
        return candidate;
      }),
    }));
    assert.equal(out.ok,true);
    assert.deepEqual(seen,['a','c']);
    assert.equal(out.observations[0].category,kind);
  }
});
test('aborted request and depleted overall time never invoke transport',async()=>{
  let count=0;
  const short=await routeR07QOfflineSemantic(request({
    needs:needs({deadlineMs:100}),
    transport:offline(async()=>{count++;return candidate;}),
  }));
  assert.equal(short.ok,false);
  const aborter=new AbortController();aborter.abort();
  const cancelled=await routeR07QOfflineSemantic(request({
    signal:aborter.signal,
    transport:offline(async()=>{count++;return candidate;}),
  }));
  assert.equal(cancelled.code,'R05_CANCELLED');
  assert.equal(count,0);
});
test('offline-only boundary rejects real transports, confidential documents, invalid fixtures',async()=>{
  await assert.rejects(routeR07QOfflineSemantic(request({
    transport:{invoke:async()=>candidate},
  })),/R07Q_UNTRUSTED_OR_LIVE_TRANSPORT/);
  for(const privacyClass of ['internal_business','confidential']){
    await assert.rejects(routeR07QOfflineSemantic(request({
      needs:needs({privacyClass}),
    })),/R07Q_PRIVATE_OR_INVALID_FIXTURE/);
  }
  await assert.rejects(routeR07QOfflineSemantic(request({
    fixture:{...request().fixture,testOnly:false},
  })),/R07Q_PRIVATE_OR_INVALID_FIXTURE/);
});
test('1001 trusted models are rejected, not silently truncated',async()=>{
  const models=Array.from({length:1001},(_,i)=>model({modelId:'m'+i}));
  await assert.rejects(routeR07QOfflineSemantic(request({models})),
    /R07Q_INVALID_TRUSTED_MODEL_POOL/);
});
test('persistent in-memory health book circuit still guards repeated failing model',async()=>{
  let now=1_000_000;
  const health=new R05HealthBook(()=>now),called=[];
  const args=request({
    needs:needs({taskType:'document_comparison'}),now:()=>now,health,
    models:[model({modelId:'broken',qualityTier:'advanced'}),
      model({modelId:'healthy',qualityTier:'basic',providerId:'backup'})],
    transport:offline(async({model:m})=>{
      called.push(m.modelId);
      if(m.modelId==='broken')throw new R05ProviderFailure('upstream');
      return candidate;
    }),
  });
  for(let i=0;i<3;i++)assert.equal((await routeR07QOfflineSemantic(args)).ok,true);
  assert.deepEqual(called,['broken','healthy','broken','healthy','healthy']);
});
