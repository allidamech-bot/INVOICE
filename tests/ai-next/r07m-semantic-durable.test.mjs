import test from 'node:test';
import assert from 'node:assert/strict';
import {R07MFastLocalCoordinator,R07M_FAST_COORDINATOR_ACTIVATED}
  from '../../dist/src/ai-next/coordinator/fast-local-coordinator.js';
import {R07PSemanticPlanner}
  from '../../dist/src/ai-next/router/semantic-planner.js';
import {R07JExperimentalIndexedJournal,R07M_FAST_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-indexed-append.js';
import {R07DExperimentalFirestoreDraftStore,R07D_DRAFT_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';
import {exactScopeKey}from '../../dist/src/ai-next/domain/turn-journal.js';

const NOW=new Date('2026-10-31T18:00:00.000Z');
const epoch=Math.floor(NOW.getTime()/1000);
const TOKEN='synthetic-r07m-semantic-token-verified-length';
const REQUEST=(message='لا خلي الكمية 12',extra={})=>({
  schemaVersion:1,accountId:'semantic-account',companyId:'semantic-company',
  branchId:'semantic-branch',threadId:'semantic-thread',scopeType:'business',
  requestId:'semantic-request',idempotencyKey:'semantic-key',
  userMessageId:'semantic-message',message,mode:'controller',...extra,
});
const scope={
  ownerUid:'semantic-owner',actorId:'semantic-owner',
  accountId:'semantic-account',companyId:'semantic-company',
  branchId:'semantic-branch',threadId:'semantic-thread',
  role:'owner',scopeType:'business',authorizationVersion:1,
};
const clone=x=>structuredClone(x);
class TxDatabase {
  docs=new Map();lock=Promise.resolve();writes=0;reads=0;
  collection(name){
    if(![R07M_FAST_COLLECTION,R07D_DRAFT_COLLECTION].includes(name))
      throw Error('UNEXPECTED_COLLECTION');
    return {doc:id=>({
      id:name+':'+id,get:async()=>this.get(name+':'+id),
    })};
  }
  get(id){
    this.reads++;
    const found=this.docs.get(id);
    return {exists:found!==undefined,
      data:()=>found===undefined?undefined:clone(found)};
  }
  async runTransaction(fn){
    const prev=this.lock;let release;
    this.lock=prev.then(()=>new Promise(ok=>{release=ok;}));
    await prev;
    try{
      const pending=new Map();
      const tx={
        get:async ref=>this.get(ref.id),
        create:(ref,value)=>{
          if(this.docs.has(ref.id)||pending.has(ref.id))throw Error('ALREADY_EXISTS');
          pending.set(ref.id,clone(value));
        },
        set:(ref,value)=>pending.set(ref.id,clone(value)),
      };
      const out=await fn(tx);
      for(const [k,v] of pending){this.docs.set(k,v);this.writes++;}
      return out;
    }finally{release();}
  }
}
const candidate=(extra={})=>({
  action:'edit_draft',subject:null,reference:'active_draft',
  facts:[{name:'quantity',value:'12'}],sourceIds:[],missingFields:[],...extra,
});
function harness(database=new TxDatabase(),options={}){
  const metrics={interpretations:0};
  const principal={verify:async()=>({
    uid:'semantic-owner',role:'owner',anonymous:false,
    tokenIssuedAt:epoch-100,tokenExpiresAt:epoch+3600,
    authenticatedAt:epoch-200,
  })};
  const membership={readForActor:async()=>options.revoked?null:{
    ownerUid:'semantic-owner',actorUid:'semantic-owner',active:true,
    accountId:scope.accountId,companyId:scope.companyId,
    branchId:scope.branchId,authorizationVersion:1,
    permittedRoles:['owner'],
  }};
  const context={load:async verifiedScope=>({
    scopeKey:options.contextScopeKey??exactScopeKey(verifiedScope),
    historyComplete:options.historyComplete??true,
    activeDraft:{id:'draft-synthetic-existing',kind:'quotation',
      revision:1,lineIds:['line-1']},
    references:[],
  })};
  const syntheticInterpreter={interpret:async()=>{
    metrics.interpretations++;
    if(options.failFirst&&metrics.interpretations===1)
      throw Error('synthetic-interpreter-offline');
    return options.candidate??candidate();
  }};
  const planner=new R07PSemanticPlanner({
    principal,membership,context,syntheticInterpreter,
    allowSyntheticInference:true,clock:()=>new Date(NOW),
  });
  const journal=new R07JExperimentalIndexedJournal(database,true);
  const draftStore=new R07DExperimentalFirestoreDraftStore(database);
  const coordinator=new R07MFastLocalCoordinator({
    journal,draftStore,principal,membership,clock:()=>new Date(NOW),
    offlineSemanticPlanner:options.noPlanner?undefined:planner,
    allowOfflineSemanticFixtures:options.enabled??true,
  });
  return {database,metrics,coordinator,journal,draftStore};
}
const histEnvelope=()=>({
  schemaVersion:1,accountId:scope.accountId,companyId:scope.companyId,
  branchId:scope.branchId,threadId:scope.threadId,scopeType:'business',
});
test('R07M production remains off; offline semantic entry requires server opt-in',async()=>{
  assert.equal(R07M_FAST_COORDINATOR_ACTIVATED,false);
  const h=harness(undefined,{enabled:false});
  await assert.rejects(h.coordinator.acceptOfflineSemantic(TOKEN,REQUEST()),
    /R07M_OFFLINE_SEMANTIC_DISABLED/);
  assert.equal(h.database.writes,0);
});
test('semantic candidate gets immutable R07M turn, task, messages and no draft write',async()=>{
  const h=harness();
  const value=await h.coordinator.acceptOfflineSemantic(TOKEN,REQUEST());
  assert.equal(value.status,'completed');
  assert.equal(value.semanticOutcome,'proposal_only');
  assert.equal(value.financialSaved,false);
  assert.equal(value.businessReadPerformed,false);
  assert.equal(value.draftEdited,false);
  assert.equal(value.syntheticInvocations,1);
  assert.match(value.reply,/لم أطبّق/);
  const history=await h.coordinator.history(TOKEN,histEnvelope());
  assert.equal(history.turns.length,1);
  assert.equal(history.tasks.length,1);
  assert.equal(history.tasks[0].state,'completed');
  assert.equal(history.tasks[0].taskType,'semantic_proposal_only');
  assert.equal(history.messages.length,2);
  assert.equal(history.messages[0].text,REQUEST().message);
  assert.equal(history.messages[1].text,value.reply);
  assert.equal(history.checkpointRefs.length,0);
  assert.equal(h.database.docs.size>0,true);
  assert.equal([...h.database.docs.keys()].some(x=>x.startsWith(
    R07D_DRAFT_COLLECTION+':')),false);
});
test('replay with another process preserves exact reply and request identity',async()=>{
  const db=new TxDatabase(),first=harness(db);
  const one=await first.coordinator.acceptOfflineSemantic(TOKEN,REQUEST());
  const writes=db.writes;
  const second=harness(db);
  const replay=await second.coordinator.acceptOfflineSemantic(TOKEN,REQUEST());
  assert.equal(replay.replayed,true);
  assert.equal(replay.turnId,one.turnId);
  assert.equal(replay.reply,one.reply);
  assert.equal(replay.syntheticInvocations,0);
  assert.equal(second.metrics.interpretations,0);
  assert.equal(db.writes,writes);
});
test('older semantic request replays after subsequent accepted turn',async()=>{
  const db=new TxDatabase(),h=harness(db);
  const first=await h.coordinator.acceptOfflineSemantic(TOKEN,REQUEST());
  const second=await h.coordinator.accept(
    TOKEN,REQUEST('مرحبا',{idempotencyKey:'local-key',
      requestId:'local-request',userMessageId:'local-msg',mode:'advisor'}));
  assert.equal(second.status,'completed');
  const replay=await harness(db).coordinator.acceptOfflineSemantic(TOKEN,REQUEST());
  assert.equal(replay.replayed,true);
  assert.equal(replay.turnId,first.turnId);
  assert.equal(replay.reply,first.reply);
  assert.equal((await h.coordinator.history(TOKEN,histEnvelope())).turns.length,2);
});
test('idempotency key collision with edited request is rejected before any append',async()=>{
  const h=harness();
  await h.coordinator.acceptOfflineSemantic(TOKEN,REQUEST());
  const writes=h.database.writes;
  await assert.rejects(h.coordinator.acceptOfflineSemantic(TOKEN,
    REQUEST('لا خلي السعر 15')),/R07_TURN_IDEMPOTENCY_COLLISION/);
  assert.equal(h.database.writes,writes);
});
test('missing authorization and foreign branch never reach journal or model',async()=>{
  const h=harness(undefined,{revoked:true});
  await assert.rejects(h.coordinator.acceptOfflineSemantic(TOKEN,REQUEST()),
    /AUTH_MEMBERSHIP_DENIED/);
  assert.equal(h.metrics.interpretations,0);
  assert.equal(h.database.writes,0);
  const other=harness();
  await assert.rejects(other.coordinator.acceptOfflineSemantic(TOKEN,
    REQUEST('غير السعر',{branchId:'foreign-branch'})),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal(other.database.writes,0);
  assert.equal(other.metrics.interpretations,0);
});
test('local greeting cannot bypass deterministic coordinator into semantic path',async()=>{
  const h=harness();
  await assert.rejects(h.coordinator.acceptOfflineSemantic(TOKEN,
    REQUEST('السلام عليكم')),/R07M_USE_DETERMINISTIC_ACCEPT/);
  assert.equal(h.database.writes,0);
  assert.equal(h.metrics.interpretations,0);
});
test('simulated semantic failure remains recoverable at same request key',async()=>{
  const db=new TxDatabase();
  const first=harness(db,{failFirst:true});
  await assert.rejects(first.coordinator.acceptOfflineSemantic(TOKEN,REQUEST()),
    /synthetic-interpreter-offline/);
  const current=await first.coordinator.current(TOKEN,histEnvelope());
  assert.equal(current.view.task.state,'processing');
  assert.equal(current.view.assistantReply,null);
  const restarted=harness(db);
  const recovered=await restarted.coordinator.acceptOfflineSemantic(TOKEN,REQUEST());
  assert.equal(recovered.replayed,true);
  assert.equal(recovered.syntheticInvocations,1);
  assert.equal((await restarted.coordinator.history(TOKEN,histEnvelope())).turns.length,1);
  assert.equal((await restarted.coordinator.history(TOKEN,histEnvelope())).messages.length,2);
});
test('bad scope context leaves task processing and prevents assistant fabrication',async()=>{
  const h=harness(undefined,{contextScopeKey:'another-company'});
  await assert.rejects(h.coordinator.acceptOfflineSemantic(TOKEN,REQUEST()),
    /R07P_UNTRUSTED_CONTEXT_SCOPE/);
  const current=await h.coordinator.current(TOKEN,histEnvelope());
  assert.equal(current.view.task.state,'processing');
  assert.equal(current.view.assistantReply,null);
  assert.equal(h.metrics.interpretations,0);
});
test('concurrent duplicate request creates one turn and does not post any financial result',async()=>{
  const db=new TxDatabase(),a=harness(db),b=harness(db);
  const finished=await Promise.allSettled([
    a.coordinator.acceptOfflineSemantic(TOKEN,REQUEST()),
    b.coordinator.acceptOfflineSemantic(TOKEN,REQUEST()),
  ]);
  assert.ok(finished.some(x=>x.status==='fulfilled'));
  const h=harness(db);
  const history=await h.coordinator.history(TOKEN,histEnvelope());
  assert.equal(history.turns.length,1);
  assert.equal(history.tasks.length,1);
  assert.equal(history.messages.length,2);
  assert.equal(history.tasks[0].state,'completed');
  assert.equal(history.uncertainOperations.length,0);
});
test('attempt to execute finance through semantic output is only warning, never approval',async()=>{
  const h=harness(undefined,{candidate:candidate({
    action:'execute_approved',reference:'active_draft',facts:[],
  })});
  const reply=await h.coordinator.acceptOfflineSemantic(TOKEN,
    REQUEST('اعتمد واحفظ العرض'));
  assert.match(reply.reply,/موافقة مستقلة/);
  assert.equal(reply.financialSaved,false);
  assert.equal(reply.draftEdited,false);
  assert.equal(h.database.docs.size>0,true);
  assert.equal([...h.database.docs.keys()].some(x=>
    x.startsWith(R07D_DRAFT_COLLECTION+':')),false);
});
test('read-only semantic result must not claim document was accessed',async()=>{
  const h=harness(undefined,{candidate:candidate({
    action:'read_business',reference:'none',facts:[],
  })});
  const reply=await h.coordinator.acceptOfflineSemantic(TOKEN,
    REQUEST('اقرأ رصيد العميل'));
  assert.match(reply.reply,/لم أقرأ بيانات الأعمال/);
  assert.equal(reply.businessReadPerformed,false);
});
test('synthetic planner remains required even when R07M switch is enabled',async()=>{
  const h=harness(undefined,{noPlanner:true});
  await assert.rejects(h.coordinator.acceptOfflineSemantic(TOKEN,REQUEST()),
    /R07M_OFFLINE_SEMANTIC_DISABLED/);
  assert.equal(h.database.writes,0);
});
