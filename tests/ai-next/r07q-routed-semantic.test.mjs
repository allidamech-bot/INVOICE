import test from 'node:test';
import assert from 'node:assert/strict';
import {R07QTrustedSemanticGateway,R07Q_ROUTED_SEMANTIC_ACTIVATED}
  from '../../dist/src/ai-next/router/trusted-semantic-gateway.js';
import {R07PSemanticPlanner}
  from '../../dist/src/ai-next/router/semantic-planner.js';
import {exactScopeKey}from '../../dist/src/ai-next/domain/turn-journal.js';

const NOW=new Date('2026-10-31T17:00:00.000Z');
const epoch=Math.floor(NOW.getTime()/1000);
const TOKEN='synthetic-r07q-bearer-token-of-sufficient-length';
const scope={
  ownerUid:'trusted-owner',actorId:'trusted-owner',
  accountId:'trusted-account',companyId:'trusted-company',
  branchId:'trusted-branch',threadId:'trusted-thread',
  role:'owner',scopeType:'business',authorizationVersion:1,
};
const turn=(text,changes={})=>({
  schemaVersion:1,accountId:scope.accountId,companyId:scope.companyId,
  branchId:scope.branchId,threadId:scope.threadId,scopeType:'business',
  requestId:'request-r07q',idempotencyKey:'idempotency-r07q',
  userMessageId:'msg-r07q',message:text,mode:'controller',...changes,
});
const model=(changes={})=>({
  providerId:'groq',modelId:'synthetic-verified-zero-cost',
  registryVersion:'test-only',capabilities:['TEXT','STRUCTURED_OUTPUT'],
  inputModalities:['text'],contextWindow:32000,maxImages:0,maxPages:null,
  providerEnabled:true,credentialsPresent:true,accountFreeVerified:true,
  modelZeroCostVerified:true,quotaAvailable:true,privacyApproved:true,
  healthAvailable:true,qualityTier:'capable',quotaGroupId:'synthetic-quota',
  ...changes,
});
const candidate=(changes={})=>({
  action:'read_file',subject:{kind:'document',id:'ref-1'},
  reference:'none',facts:[],sourceIds:['ref-1'],missingFields:[],...changes,
});
const config=(options={})=>{
  const calls={transport:0,discovery:0,privacy:0,auth:0,context:0};
  const result=options.result??candidate();
  const transport={invoke:async ({model,payload})=>{
    calls.transport++;
    options.onInvoke?.(model,payload);
    return typeof result==='function'?result(model,payload):result;
  }};
  const gateway=new R07QTrustedSemanticGateway({
    models:async()=>{calls.discovery++;return options.models??[model()];},
    transport,
    approveBusinessData:async()=>{calls.privacy++;
      return options.privateAllowed??true;
    },
    enableRoutedInference:options.enabled??true,
    clock:()=>Date.now(),
  });
  const principal={verify:async()=>{calls.auth++;return {
    uid:'trusted-owner',role:'owner',tokenIssuedAt:epoch-100,
    tokenExpiresAt:epoch+3600,authenticatedAt:epoch-200,anonymous:false,
  };}};
  const membership={readForActor:async()=>options.revoked?null:{
    ownerUid:'trusted-owner',actorUid:'trusted-owner',
    accountId:scope.accountId,companyId:scope.companyId,
    branchId:scope.branchId,active:true,authorizationVersion:1,
    permittedRoles:['owner'],
  }};
  const planner=new R07PSemanticPlanner({
    principal,membership,
    context:{load:async scoped=>{calls.context++;
      return options.context??{
        scopeKey:exactScopeKey(scoped),historyComplete:true,
        activeDraft:{id:'draft-origin',kind:'quotation',revision:1,
          lineIds:['line-1']},
        references:[{kind:'document',id:'secret-internal-document-id',
          documentKind:'quotation',scopeKey:exactScopeKey(scoped)}],
      };
    }},
    routedInterpreter:gateway,
    allowRoutedInference:options.plannerEnabled??true,
    clock:()=>new Date(NOW),
  });
  const plan=(message='اقرأ الملف السابق',changes={})=>
    planner.plan(TOKEN,turn(message,changes));
  return {planner,gateway,plan,calls};
};
test('R07Q integration remains unmounted and disabled by default',async()=>{
  assert.equal(R07Q_ROUTED_SEMANTIC_ACTIVATED,false);
  const c=config({enabled:false});
  const out=await c.plan();
  assert.equal(out.status,'unsupported');
  assert.equal(c.calls.transport,0);
  assert.equal(c.calls.discovery,0);
});
test('deterministic local greeting never touches privacy or model gateway',async()=>{
  const c=config();
  const result=await c.plan('السلام عليكم');
  assert.equal(result.status,'local_reply');
  assert.equal(result.providerCalls,0);
  assert.equal(c.calls.privacy,0);
  assert.equal(c.calls.transport,0);
  assert.equal(c.calls.discovery,0);
});
test('routed semantic candidate resolves only server-verified document handles',async()=>{
  const c=config({onInvoke:(_m,payload)=>{
    assert.equal(payload.instruction.task,'semantic_interpretation_only');
    const json=JSON.stringify(payload);
    assert.ok(!json.includes('secret-internal-document-id'));
    assert.ok(!json.includes('trusted-company'));
    assert.deepEqual(payload.references,[{kind:'document',handle:'ref-1'}]);
  }});
  const response=await c.plan();
  assert.equal(response.status,'proposed');
  assert.equal(response.interpretation,'routed_model');
  assert.equal(response.intent.subjectRef.id,'secret-internal-document-id');
  assert.deepEqual(response.intent.referencedSourceIds,
    ['secret-internal-document-id']);
  assert.equal(response.providerCalls,1);
  assert.equal(response.intent.executable,false);
  assert.equal(response.financialSaved,false);
  assert.equal(c.calls.transport,1);
  assert.equal(c.calls.privacy,1);
});
test('missing private-data consent skips discovery and transport',async()=>{
  const c=config({privateAllowed:false});
  const response=await c.plan();
  assert.equal(response.status,'unsupported');
  assert.equal(response.providerCalls,0);
  assert.equal(c.calls.transport,0);
  assert.equal(c.calls.discovery,0);
  assert.equal(c.calls.privacy,1);
});
test('unverified free-cost or privacy flags prevent all provider calls',async()=>{
  for(const invalid of [
    {accountFreeVerified:false},
    {modelZeroCostVerified:false},
    {credentialsPresent:false},
    {privacyApproved:false},
    {quotaAvailable:false},
    {providerEnabled:false},
    {capabilities:['TEXT']},
  ]){
    const c=config({models:[model(invalid)]});
    const output=await c.plan();
    assert.equal(output.status,'unsupported');
    assert.equal(output.providerCalls,0);
    assert.equal(c.calls.transport,0);
  }
});
test('unknown reference, forged source, model-execution field fail validation',async()=>{
  for(const invalid of [
    candidate({subject:{kind:'document',id:'secret-internal-document-id'}}),
    candidate({sourceIds:['ref-foreign']}),
    candidate({subject:{kind:'entity',id:'ref-1'}}),
    {...candidate(),executed:true},
  ]){
    const c=config({result:invalid});
    const out=await c.plan();
    assert.equal(out.status,'unsupported');
    assert.equal(out.providerCalls,1);
    assert.equal(c.calls.transport,1);
    assert.equal(out.financialSaved,false);
  }
});
test('invalid model result falls back only to independent verified free model',async()=>{
  const c=config({
    models:[model({modelId:'advanced',qualityTier:'advanced'}),
      model({providerId:'gemini',modelId:'free-backup',qualityTier:'basic'})],
    result:m=>m.modelId==='advanced'?
      candidate({sourceIds:['ref-not-found']}):candidate(),
  });
  const out=await c.plan();
  assert.equal(out.status,'proposed');
  assert.equal(out.providerCalls,2);
  assert.equal(c.calls.transport,2);
  assert.equal(out.intent.executable,false);
});
test('provider errors fail safely and do not invent a reply or financial success',async()=>{
  const c=config({result:()=>{throw Error('synthetic offline failure');}});
  const out=await c.plan();
  assert.equal(out.status,'unsupported');
  assert.equal(out.financialSaved,false);
  assert.equal(out.intent.executable,false);
  assert.ok(out.providerCalls>=1&&out.providerCalls<=3);
  assert.match(out.assistantReply,/لم يتم إجراء أي تغيير/);
});
test('scope authorization blocks forged branch and revoked identity before inference',async()=>{
  const a=config({revoked:true});
  await assert.rejects(a.plan(),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal(a.calls.transport,0);
  const b=config();
  await assert.rejects(b.plan('اقرأ العرض',{branchId:'forged-branch'}),
    /AUTH_MEMBERSHIP_DENIED/);
  assert.equal(b.calls.discovery,0);
});
test('model suggestions cannot manufacture approval or financial execution',async()=>{
  const c=config({result:{
    action:'execute_approved',subject:null,reference:'active_draft',
    facts:[],sourceIds:[],missingFields:[],
  }});
  const out=await c.plan('وافق واحفظه');
  assert.equal(out.status,'approval_required');
  assert.equal(out.intent.action,'clarify');
  assert.equal(out.intent.executable,false);
  assert.equal(out.financialSaved,false);
});
test('circuit-bound alternate route still rejects paid fallback models',async()=>{
  const c=config({
    models:[model({modelId:'first'}),
      model({providerId:'openrouter',modelId:'paid-model',
        modelZeroCostVerified:false,qualityTier:'advanced'})],
    result:()=>{throw Error('offline failure');},
  });
  const out=await c.plan();
  assert.equal(out.status,'unsupported');
  assert.equal(out.providerCalls,1);
  assert.equal(c.calls.transport,1);
});
test('routed and synthetic inference configurations cannot compete',async()=>{
  const c=config();
  const p=new R07PSemanticPlanner({
    principal:{verify:async()=>({
      uid:'trusted-owner',role:'owner',tokenIssuedAt:epoch-100,
      tokenExpiresAt:epoch+3600,authenticatedAt:epoch-200,anonymous:false,
    })},
    membership:{readForActor:async()=>({
      ownerUid:'trusted-owner',actorUid:'trusted-owner',
      accountId:scope.accountId,companyId:scope.companyId,
      branchId:scope.branchId,active:true,authorizationVersion:1,
      permittedRoles:['owner'],
    })},
    context:{load:async()=>({
      scopeKey:exactScopeKey(scope),historyComplete:true,activeDraft:null,
      references:[],
    })},
    routedInterpreter:c.gateway,allowRoutedInference:true,
    syntheticInterpreter:{interpret:async()=>candidate()},
    allowSyntheticInference:true,clock:()=>new Date(NOW),
  });
  await assert.rejects(p.plan(TOKEN,turn('اقرأ الملف')),
    /R07P_CONFLICTING_INFERENCE_CONFIG/);
});
