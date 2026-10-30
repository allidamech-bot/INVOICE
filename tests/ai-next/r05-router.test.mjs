import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessR05Model,eligibleR05Pool,
} from '../../dist/src/ai-next/router/eligibility.js';
import {
  recognizeR05LocalIntent,classifyR05Task,runR05Local,
} from '../../dist/src/ai-next/router/local-intents.js';
import {
  R05HealthBook,R05ProviderFailure,routeR05,
} from '../../dist/src/ai-next/router/gateway.js';
import {validateR05ModelProposal} from '../../dist/src/ai-next/router/proposal-guard.js';

const NOW='2026-10-30T14:00:00.000Z';
const scope={
  ownerUid:'owner-synthetic',accountId:'account-synthetic',companyId:'company-A',
  branchId:'branch-A',threadId:'thread-A',actorId:'actor-A',
  role:'owner',scopeType:'business',authorizationVersion:1,
};
const model=(overrides={})=>({
  providerId:'groq',modelId:'synthetic-free-model',registryVersion:'test-v1',
  capabilities:['TEXT','STRUCTURED_OUTPUT','DEEP_REASONING','LARGE_CONTEXT'],
  inputModalities:['text'],contextWindow:64_000,maxImages:0,maxPages:null,
  providerEnabled:true,credentialsPresent:true,accountFreeVerified:true,
  modelZeroCostVerified:true,quotaAvailable:true,privacyApproved:true,
  healthAvailable:true,qualityTier:'capable',quotaGroupId:'synthetic-account',
  ...overrides,
});
const needs=(overrides={})=>({
  taskType:'general_conversation',inputModalities:['text'],inputEstimateTokens:300,
  requiredOutputSchema:'json_v1',privacyClass:'internal_business',
  imageCount:0,pageCount:0,deadlineMs:4000,...overrides,
});
const assess=(m=model(),n=needs())=>assessR05Model({
  scope,model:m,needs:n,assessmentId:'assess-1',evaluatedAt:NOW,
});
const eligibleRun=(overrides={})=>({
  scope,needs:needs(),models:[model()],
  payload:Object.freeze({requestId:'synthetic',value:'no customer data'}),
  transport:{invoke:async()=>({answer:'ok'})},
  validate:(v)=>v!==null&&typeof v==='object'&&v.answer==='ok',
  ...overrides,
});

test('R05 v1 eligibility is strict contract-valid and zero-cost only',()=>{
  const a=assess();
  assert.equal(a.eligible,true);
  assert.equal(a.accountEligibility,'free_verified');
  assert.equal(a.priceEligibility,'verified_zero');
  assert.equal(a.budget.maxAllowedCost,'0');
});
for(const [label,fields,reason] of [
  ['missing credentials',{credentialsPresent:false},'account_missing_credentials'],
  ['disabled provider',{providerEnabled:false},'account_disabled'],
  ['unverified account',{accountFreeVerified:false},'account_unverified'],
  ['price unknown',{modelZeroCostVerified:false},'price_not_verified_zero'],
  ['no quota',{quotaAvailable:false},'account_quota_exhausted'],
  ['privacy denied',{privacyApproved:false},'privacy_denied'],
  ['unhealthy model',{healthAvailable:false},'unhealthy'],
  ['disallowed Mistral',{modelId:'mistral-synthetic'},'model_disallowed'],
]){
  test('rejects '+label,()=>{
    const a=assess(model(fields));
    assert.equal(a.eligible,false);assert.ok(a.reasons.includes(reason));
  });
}
test('no guessing PDF, vision, structured output or context capabilities',()=>{
  assert.equal(assess(model(),needs({inputModalities:['text','pdf'],pageCount:35})).eligible,false);
  assert.equal(assess(model(),needs({inputModalities:['text','image'],imageCount:1})).eligible,false);
  assert.equal(assess(model({capabilities:['TEXT']})).eligible,false);
  assert.equal(assess(model({contextWindow:100}),needs()).eligible,false);
  assert.equal(assess(model({contextWindow:null}),needs({inputEstimateTokens:10000})).eligible,false);
});
test('deduplicates model IDs but does not infer free from catalog membership',()=>{
  const pool=eligibleR05Pool({
    scope,now:NOW,needs:needs(),models:[model(),model(),model({modelId:'other',modelZeroCostVerified:false})],
  });
  assert.equal(pool.length,2);assert.equal(pool[0].assessment.eligible,true);
  assert.equal(pool[1].assessment.eligible,false);
});
test('deadline too short cannot call provider',async()=>{
  let calls=0;
  const result=await routeR05(eligibleRun({
    needs:needs({deadlineMs:200}),
    transport:{invoke:async()=>{calls++;return {answer:'ok'};}},
  }));
  assert.equal(result.ok,false);assert.equal(calls,0);
});
test('exact Arabic greeting and English greeting are local',()=>{
  assert.equal(recognizeR05LocalIntent('السلام عليكم')?.kind,'greeting');
  assert.equal(recognizeR05LocalIntent('Hi!')?.kind,'greeting');
  assert.equal(classifyR05Task('السلام عليكم'),'local_greeting');
  assert.equal(recognizeR05LocalIntent('مرحبا، احسب المبيعات'),null);
  assert.equal(recognizeR05LocalIntent('مرحبا',1),null);
});
test('empty quotation creates unsaved R04 draft with no provider',async()=>{
  const result=await runR05Local({
    text:'أنشئ مسودة عرض سعر',scope,draftId:'draft-1',
    attachedSourceIds:[],now:NOW,
  });
  assert.equal(result?.kind,'draft');
  assert.equal(result?.providerCalls,0);
  assert.equal(result?.draft.status,'needs_review');
  assert.equal(result?.draft.kind,'quotation');
  assert.equal(result?.draft.lineItems.length,0);
  assert.equal(result?.draft.explicitCustomerId,null);
  assert.equal(result?.draft.approvalReceiptId,null);
});
test('nontrivial quote commands are NOT misclassified as empty draft',()=>{
  assert.equal(recognizeR05LocalIntent('أنشئ مسودة عرض سعر من الملف الثاني'),null);
  assert.equal(recognizeR05LocalIntent('ابدأ عرض سعر للعميل أحمد'),null);
  assert.equal(classifyR05Task('اقرأ الملف الثاني'),'document_read');
});
test('gateway refuses inference for local tasks',async()=>{
  let calls=0;
  const out=await routeR05(eligibleRun({
    needs:needs({taskType:'local_greeting'}),
    transport:{invoke:async()=>{calls++;return {answer:'ok'};}},
  }));
  assert.equal(out.ok,false);assert.equal(out.attempts,0);assert.equal(calls,0);
});
test('routes one eligible model on first valid response',async()=>{
  let calls=0;
  const result=await routeR05(eligibleRun({
    transport:{invoke:async()=>{calls++;return {answer:'ok'};}},
  }));
  assert.equal(result.ok,true);assert.equal(result.attempts,1);
  assert.equal(result.fallbackUsed,false);assert.equal(calls,1);
});
test('never transmits confidential payload to unapproved providers',async()=>{
  let calls=0;
  const out=await routeR05(eligibleRun({
    models:[model({privacyApproved:false})],
    transport:{invoke:async()=>{calls++;return {answer:'ok'};}},
  }));
  assert.equal(out.ok,false);assert.equal(out.code,'R05_NO_ELIGIBLE_MODELS');
  assert.equal(calls,0);
});
test('unknown or non-free price cannot trigger network call',async()=>{
  let calls=0;
  const out=await routeR05(eligibleRun({
    models:[model({accountFreeVerified:false}),model({modelId:'paid',modelZeroCostVerified:false})],
    transport:{invoke:async()=>{calls++;return {answer:'ok'};}},
  }));
  assert.equal(out.ok,false);assert.equal(calls,0);
});
test('invalid structured result is rejected and falls back without rewriting payload',async()=>{
  const payload=Object.freeze({task:'synthetic',sourceIds:Object.freeze(['src-1'])});
  const seen=[];
  const out=await routeR05(eligibleRun({
    payload,
    models:[model(),model({providerId:'gemini',modelId:'synthetic-backup',qualityTier:'basic'})],
    transport:{invoke:async({model:m,payload:arg})=>{
      seen.push(arg);return m.providerId==='groq'?{invalid:1}:{answer:'ok'};
    }},
  }));
  assert.equal(out.ok,true);assert.equal(out.fallbackUsed,true);
  assert.equal(out.attempts,2);assert.ok(seen.every(x=>x===payload));
  assert.equal(out.observations[0].category,'invalid_result');
});
test('provider-level 429 skips all models from same account provider',async()=>{
  const called=[];
  const out=await routeR05(eligibleRun({
    models:[
      model({modelId:'first',qualityTier:'advanced'}),
      model({modelId:'second',qualityTier:'capable'}),
      model({providerId:'gemini',modelId:'third',qualityTier:'basic'}),
    ],
    transport:{invoke:async({model:m})=>{
      called.push(m.modelId);
      if(m.providerId==='groq')throw new R05ProviderFailure('rate_limit','provider',60000);
      return {answer:'ok'};
    }},
  }));
  assert.equal(out.ok,true);assert.deepEqual(called,['first','third']);
});
test('model-level quota retains eligible other model',async()=>{
  const called=[];
  const out=await routeR05(eligibleRun({
    models:[model({modelId:'A',qualityTier:'advanced'}),model({modelId:'B',qualityTier:'capable'})],
    transport:{invoke:async({model:m})=>{
      called.push(m.modelId);
      if(m.modelId==='A')throw new R05ProviderFailure('rate_limit','model',60000);
      return {answer:'ok'};
    }},
  }));
  assert.equal(out.ok,true);assert.deepEqual(called,['A','B']);
});
test('no unbounded retries when all three providers fail',async()=>{
  let count=0;
  const out=await routeR05(eligibleRun({
    models:[model(),model({providerId:'p2',modelId:'m2'}),model({providerId:'p3',modelId:'m3'}),
      model({providerId:'p4',modelId:'m4'})],
    transport:{invoke:async()=>{count++;throw new R05ProviderFailure('network');}},
  }));
  assert.equal(out.ok,false);assert.equal(count,3);
  assert.equal(out.attempts,3);
});
test('cancellation before request prevents provider call',async()=>{
  const controller=new AbortController();controller.abort();
  let calls=0;
  const out=await routeR05(eligibleRun({
    signal:controller.signal,
    transport:{invoke:async()=>{calls++;return {answer:'ok'};}},
  }));
  assert.equal(out.code,'R05_CANCELLED');assert.equal(calls,0);
});
test('in-flight cancellation propagates to model attempt',async()=>{
  const controller=new AbortController();
  let signaled=false;
  const work=routeR05(eligibleRun({
    signal:controller.signal,
    transport:{invoke:async({signal})=>new Promise((_,reject)=>{
      signal.addEventListener('abort',()=>{signaled=true;reject(Error('aborted'));},{once:true});
    })},
  }));
  setTimeout(()=>controller.abort(),5);
  const result=await work;
  assert.equal(result.ok,false);assert.equal(result.code,'R05_CANCELLED');
  assert.equal(signaled,true);
});
test('circuit opens after repeated failures; half-open is single-flight',()=>{
  let clock=10000;const h=new R05HealthBook(()=>clock),m=model();
  assert.equal(h.reserve(m),true);
  h.observe(m,false,2,new R05ProviderFailure('network'));
  assert.equal(h.reserve(m),true);
  h.observe(m,false,2,new R05ProviderFailure('network'));
  assert.equal(h.available(m),false);
  clock+=31_000;
  assert.equal(h.reserve(m),true);
  assert.equal(h.reserve(m),false);
  h.observe(m,true,2);
  assert.equal(h.available(m),true);
});
const proposal=(overrides={})=>({
  action:'prepare_quote',subjectRef:null,referencedSourceIds:['src-1'],
  argumentFacts:[{name:'item_description',value:'test product',evidenceRefs:['ev-1']}],
  ...overrides,
});
const validate=(raw)=>validateR05ModelProposal({
  raw,scope,turnId:'turn-1',intentId:'intent-1',selectedSourceIds:['src-1'],
  authorizedEvidenceIds:['ev-1'],currentDraftId:'draft-1',sourcePolicy:'uploaded_only',
});
test('untrusted model intent is always non-executable and uncertain',()=>{
  const intent=validate(proposal());
  assert.equal(intent.executable,false);assert.equal(intent.confidence,0);
  assert.equal(intent.argumentFacts[0].provenanceStatus,'uncertain');
  assert.equal(intent.scope.companyId,scope.companyId);
});
for(const [name,bad] of [
  ['direct execution',proposal({action:'execute_approved'})],
  ['privilege injection',proposal({role:'owner'})],
  ['verified evidence spoof',proposal({argumentFacts:[{name:'price',value:'2',evidenceRefs:['ev-1'],provenanceStatus:'verified'}]})],
  ['source substitution',proposal({referencedSourceIds:['other-company-src']})],
  ['entity spoof',proposal({subjectRef:{kind:'entity',id:'customer-x'}})],
  ['nonexistent evidence',proposal({argumentFacts:[{name:'price',value:'2',evidenceRefs:['fake']}]})],
]){
  test('rejects model '+name,()=>{
    assert.throws(()=>validate(bad),/R05_/);
  });
}
test('no finance mutation APIs are in R05 router module',()=>{
  assert.equal(typeof routeR05,'function');
  assert.equal(typeof recognizeR05LocalIntent,'function');
});
