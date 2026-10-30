import test from 'node:test';
import assert from 'node:assert/strict';
import {SyntheticAtomicEventBackend,ScopedConversationLedger}
  from '../../dist/src/ai-next/conversation-state/event-store.js';
import {R07LocalCoordinator,R07B_LOCAL_COORDINATOR_ACTIVATED}
  from '../../dist/src/ai-next/coordinator/local-coordinator.js';
import {exactScopeKey} from '../../dist/src/ai-next/domain/turn-journal.js';

const now=new Date('2026-10-30T15:50:00.000Z'),nowSeconds=Math.floor(now.getTime()/1000);
const env=(overrides={})=>({
  schemaVersion:1,accountId:'account1',companyId:'company1',
  branchId:'branch1',threadId:'thread1',scopeType:'business',
  requestId:'req1',idempotencyKey:'idem1',userMessageId:'user-message1',
  message:'السلام عليكم',mode:'advisor',...overrides,
});
const principal=(role='owner')=>({
  verify:async()=>({
    uid:'signed-user',role,
    tokenIssuedAt:nowSeconds-30,tokenExpiresAt:nowSeconds+3600,
    authenticatedAt:nowSeconds-100,anonymous:false,
  }),
});
const memberships=(role='owner')=>({
  readForActor:async()=>({
    ownerUid:'signed-user',actorUid:'signed-user',
    accountId:'account1',companyId:'company1',branchId:'branch1',
    active:true,authorizationVersion:2,permittedRoles:[role],
  }),
});
class TestDraftStore{
  constructor(){this.data=new Map();this.writes=0;this.fail=false;}
  key(scope,turnId){return exactScopeKey(scope)+':'+turnId;}
  async createIfAbsent(scope,turnId,draft){
    if(this.fail)throw Error('synthetic storage down');
    const key=this.key(scope,turnId),existing=this.data.get(key);
    if(existing){
      if(existing.immutableRevisionHash!==draft.immutableRevisionHash)
        throw Error('synthetic revision collision');
      return structuredClone(existing);
    }
    this.data.set(key,structuredClone(draft));this.writes++;
    return structuredClone(draft);
  }
  async read(scope,turnId){
    const found=this.data.get(this.key(scope,turnId));
    return found?structuredClone(found):null;
  }
}
function harness(overrides={}){
  const ledger=overrides.ledger??new ScopedConversationLedger(new SyntheticAtomicEventBackend());
  const draftStore=overrides.draftStore??new TestDraftStore();
  const deps={
    ledger,draftStore,principal:overrides.principal??principal(),
    membership:overrides.membership??memberships(),clock:()=>new Date(now),
  };
  return {coordinator:new R07LocalCoordinator(deps),ledger,draftStore,deps};
}
test('no R07 local public API activation or financial writer',()=>{
  assert.equal(R07B_LOCAL_COORDINATOR_ACTIVATED,false);
});
test('local greeting commits authoritative turn, user, assistant and terminal task',async()=>{
  const {coordinator}=harness();
  const result=await coordinator.accept('synthetic-bearer-token-1234567890',env());
  assert.equal(result.status,'completed');
  assert.equal(result.financialSaved,false);
  assert.equal(result.providerCalls,0);
  assert.equal(result.draft,null);
  assert.match(result.reply,/وعليكم السلام/);
  const snapshot=await coordinator.history('synthetic-bearer-token-1234567890',{
    schemaVersion:1,accountId:'account1',companyId:'company1',
    branchId:'branch1',threadId:'thread1',scopeType:'business',
  });
  assert.equal(snapshot.turns.length,1);
  assert.equal(snapshot.messages.length,2);
  assert.equal(snapshot.tasks[0].state,'completed');
  assert.equal(snapshot.tasks[0].executionOperationId,null);
});
test('unsaved empty quote is committed only after trusted draft store confirms',async()=>{
  const {coordinator,draftStore}=harness();
  const result=await coordinator.accept('synthetic-bearer-token-1234567890',env({
    mode:'controller',message:'أنشئ مسودة عرض سعر',
  }));
  assert.equal(result.status,'completed');
  assert.equal(result.financialSaved,false);
  assert.equal(result.providerCalls,0);
  assert.equal(result.draft.kind,'quotation');
  assert.equal(result.draft.draftRevision,1);
  assert.equal(result.draft.status,'needs_review');
  assert.equal(result.draft.lineItems.length,0);
  assert.equal(result.draft.approvalReceiptId,null);
  assert.equal(draftStore.writes,1);
  const s=await coordinator.history('synthetic-bearer-token-1234567890',{
    schemaVersion:1,accountId:'account1',companyId:'company1',
    branchId:'branch1',threadId:'thread1',scopeType:'business',
  });
  assert.equal(s.tasks[0].draftId,result.draft.draftId);
  assert.equal(s.tasks[0].state,'completed');
});
test('idempotent replay returns same turn and no second draft or message',async()=>{
  const {coordinator,draftStore}=harness();
  const r=env({mode:'controller',message:'أنشئ مسودة عرض سعر'});
  const first=await coordinator.accept('synthetic-bearer-token-1234567890',r);
  const second=await coordinator.accept('synthetic-bearer-token-1234567890',r);
  assert.equal(second.turnId,first.turnId);
  assert.equal(second.replayed,true);
  assert.equal(second.draft.immutableRevisionHash,first.draft.immutableRevisionHash);
  assert.equal(second.conversationRevision,first.conversationRevision);
  assert.equal(draftStore.writes,1);
});
test('new coordinator with same shared repositories restores committed draft',async()=>{
  const h=harness();
  const request=env({mode:'controller',message:'أنشئ مسودة عرض سعر'});
  const first=await h.coordinator.accept('synthetic-bearer-token-1234567890',request);
  const second=new R07LocalCoordinator(h.deps);
  const repeated=await second.accept('synthetic-bearer-token-1234567890',request);
  assert.equal(repeated.draft.draftId,first.draft.draftId);
  assert.equal(repeated.replayed,true);
});
test('same idempotency key with changed task or client identity is rejected',async()=>{
  const {coordinator}=harness();await coordinator.accept('synthetic-bearer-token-1234567890',env());
  for(const override of [
    {message:'مرحبا'},{mode:'controller'},{requestId:'other-request'},
    {userMessageId:'other-message'},
  ])await assert.rejects(coordinator.accept('synthetic-bearer-token-1234567890',env(override)),
    /R07_TURN_IDEMPOTENCY_COLLISION/);
});
test('unsupported and attached requests never silently invoke a provider',async()=>{
  const {coordinator}=harness();
  await assert.rejects(coordinator.accept('synthetic-bearer-token-1234567890',env({
    message:'استخرج أسعار المنتجات من الملف',
  })),/R07_LOCAL_INTENT_NOT_SUPPORTED/);
  await assert.rejects(coordinator.accept('synthetic-bearer-token-1234567890',{
    ...env(),attachedSourceIds:['doc1'],
  }),/R07_INVALID_TURN_INPUT/);
});
test('missing server ACL refuses the request before any event',async()=>{
  const h=harness({membership:{readForActor:async()=>null}});
  await assert.rejects(h.coordinator.accept('synthetic-bearer-token-1234567890',env()),
    /AUTH_MEMBERSHIP_DENIED/);
  // Ledger has never accepted a turn.
  const scope={
    ownerUid:'signed-user',accountId:'account1',companyId:'company1',
    branchId:'branch1',threadId:'thread1',actorId:'signed-user',
    role:'owner',scopeType:'business',authorizationVersion:2,
  };
  assert.equal((await h.ledger.snapshot(scope)).turns.length,0);
});
test('viewer can greet, but cannot prepare any quote draft',async()=>{
  const h=harness({principal:principal('viewer'),membership:memberships('viewer')});
  const greeting=await h.coordinator.accept('synthetic-bearer-token-1234567890',env());
  assert.equal(greeting.status,'completed');
  await assert.rejects(h.coordinator.accept('synthetic-bearer-token-1234567890',env({
    mode:'controller',message:'أنشئ مسودة عرض سعر',idempotencyKey:'new',
    requestId:'new',userMessageId:'new',
  })),/R07_DRAFT_PREPARATION_DENIED/);
});
test('wrong company and branch are rejected despite valid signed user',async()=>{
  const h=harness();
  await assert.rejects(h.coordinator.accept('synthetic-bearer-token-1234567890',env({companyId:'company2'})),
    /AUTH_MEMBERSHIP_DENIED/);
  await assert.rejects(h.coordinator.accept('synthetic-bearer-token-1234567890',env({branchId:'branch2'})),
    /AUTH_MEMBERSHIP_DENIED/);
});
test('draft storage outage cannot be reported as successful creation',async()=>{
  const h=harness(),request=env({mode:'controller',message:'أنشئ مسودة عرض سعر'});
  h.draftStore.fail=true;
  await assert.rejects(h.coordinator.accept('synthetic-bearer-token-1234567890',request),/synthetic storage down/);
  h.draftStore.fail=false;
  const resumed=await h.coordinator.accept('synthetic-bearer-token-1234567890',request);
  assert.equal(resumed.replayed,true);
  assert.equal(resumed.draft.status,'needs_review');
  assert.equal(h.draftStore.writes,1);
});
test('missing draft after event completion is detected, never reported as saved',async()=>{
  const h=harness(),request=env({mode:'controller',message:'أنشئ مسودة عرض سعر'});
  await h.coordinator.accept('synthetic-bearer-token-1234567890',request);
  h.draftStore.data.clear();
  await assert.rejects(h.coordinator.accept('synthetic-bearer-token-1234567890',request),
    /R07_MISSING_VERIFIED_DRAFT/);
});
test('different request while first is processing is blocked',async()=>{
  const h=harness(),request=env({mode:'controller',message:'أنشئ مسودة عرض سعر'});
  h.draftStore.fail=true;
  await assert.rejects(h.coordinator.accept('synthetic-bearer-token-1234567890',request));
  await assert.rejects(h.coordinator.accept('synthetic-bearer-token-1234567890',env({
    idempotencyKey:'new2',requestId:'new2',userMessageId:'new2',message:'مرحبا',
  })),/R07_ANOTHER_TURN_ACTIVE/);
});
test('two concurrent identical commands converge without duplicate draft',async()=>{
  const h=harness(),request=env({mode:'controller',message:'أنشئ مسودة عرض سعر'});
  const results=await Promise.allSettled([
    h.coordinator.accept('synthetic-bearer-token-1234567890',request),
    h.coordinator.accept('synthetic-bearer-token-1234567890',request),
  ]);
  // Even if one CAS retry fails closed, no second financial/draft object may exist.
  assert.equal(results.filter(x=>x.status==='fulfilled').length>=1,true);
  assert.equal(h.draftStore.writes,1);
});
test('revocation is rechecked before replay; history does not bypass ACL',async()=>{
  let permitted=true,calls=0;
  const h=harness({membership:{readForActor:async()=>{calls++;
    return permitted?memberships().readForActor({}):null;
  }}});
  await h.coordinator.accept('synthetic-bearer-token-1234567890',env());
  permitted=false;
  await assert.rejects(h.coordinator.accept('synthetic-bearer-token-1234567890',env()),
    /AUTH_MEMBERSHIP_DENIED/);
  await assert.rejects(h.coordinator.history('synthetic-bearer-token-1234567890',{
    schemaVersion:1,accountId:'account1',companyId:'company1',
    branchId:'branch1',threadId:'thread1',scopeType:'business',
  }),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal(calls,3);
});
test('no forged actor or company override fields accepted',async()=>{
  const h=harness();
  await assert.rejects(h.coordinator.accept('synthetic-bearer-token-1234567890',{
    ...env(),role:'owner',approval:true,
  }),/R07_INVALID_TURN_INPUT/);
});
