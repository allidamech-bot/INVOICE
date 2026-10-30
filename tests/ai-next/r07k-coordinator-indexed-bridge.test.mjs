import test from 'node:test';
import assert from 'node:assert/strict';
import {R07LocalCoordinator}
  from '../../dist/src/ai-next/coordinator/local-coordinator.js';
import {R07KIndexedCoordinatorLedger,R07K_COORDINATOR_INDEXED_BRIDGE_ACTIVATED}
  from '../../dist/src/ai-next/coordinator/indexed-ledger-bridge.js';
import {R07JExperimentalIndexedJournal,R07J_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-indexed-append.js';
import {R07DExperimentalFirestoreDraftStore,R07D_DRAFT_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';
const NOW=new Date('2026-10-31T14:00:00.000Z');
const epoch=Math.floor(NOW.getTime()/1000);
const clone=x=>structuredClone(x);
const envelope=(changes={})=>({
  schemaVersion:1,accountId:'account-r07k',companyId:'company-r07k',
  branchId:'branch-r07k',threadId:'thread-r07k',scopeType:'business',
  requestId:'request-one',idempotencyKey:'turn-request-one',
  userMessageId:'user-msg-one',message:'السلام عليكم',mode:'advisor',...changes,
});
const historyRequest=(changes={})=>({
  schemaVersion:1,accountId:'account-r07k',companyId:'company-r07k',
  branchId:'branch-r07k',threadId:'thread-r07k',scopeType:'business',...changes,
});
class SharedTransactionalFirestore{
  docs=new Map();lock=Promise.resolve();reads=0;writes=0;
  collection(name){
    if(![R07J_COLLECTION,R07D_DRAFT_COLLECTION].includes(name))
      throw Error('UNEXPECTED_COLLECTION');
    return {doc:id=>({id:name+':'+id,get:async()=>this.snapshot(name+':'+id)})};
  }
  snapshot(id){
    this.reads++;
    const data=this.docs.get(id);
    return {exists:data!==undefined,
      data:()=>data===undefined?undefined:clone(data)};
  }
  async runTransaction(action){
    const prior=this.lock;let unlock;
    const pending=new Promise(resolve=>{unlock=resolve;});
    this.lock=prior.then(()=>pending);await prior;
    try{
      const edits=new Map();
      const tx={
        get:async ref=>this.snapshot(ref.id),
        create:(ref,value)=>{
          if(this.docs.has(ref.id)||edits.has(ref.id))
            throw Error('ALREADY_EXISTS');
          edits.set(ref.id,clone(value));
        },
        set:(ref,value)=>edits.set(ref.id,clone(value)),
      };
      const result=await action(tx);
      for(const [key,value] of edits){
        this.docs.set(key,value);this.writes++;
      }
      return result;
    }finally{unlock();}
  }
}
const principal=(role='owner')=>({
  verify:async()=>({uid:'signed-r07k',role,
    tokenIssuedAt:epoch-100,tokenExpiresAt:epoch+3600,
    authenticatedAt:epoch-200,anonymous:false}),
});
const membership=(role='owner')=>({
  readForActor:async()=>({ownerUid:'signed-r07k',actorUid:'signed-r07k',
    accountId:'account-r07k',companyId:'company-r07k',
    branchId:'branch-r07k',active:true,authorizationVersion:1,
    permittedRoles:[role]}),
});
const harness=(db=new SharedTransactionalFirestore(),override={})=>{
  const ledger=new R07KIndexedCoordinatorLedger(
    new R07JExperimentalIndexedJournal(db));
  const draftStore=override.draftStore??new R07DExperimentalFirestoreDraftStore(db);
  const deps={ledger,draftStore,principal:override.principal??principal(),
    membership:override.membership??membership(),clock:()=>new Date(NOW)};
  return {db,ledger,draftStore,deps,coordinator:new R07LocalCoordinator(deps)};
};
const TOKEN='signed-synthetic-token-not-a-live-account';
test('R07K bridge remains disabled, new collection and financial execution absent',()=>{
  assert.equal(R07K_COORDINATOR_INDEXED_BRIDGE_ACTIVATED,false);
  assert.equal(R07J_COLLECTION,'aiNextIndexedEventThreadsV1');
});
test('real R07 local coordinator greeting persists R07J indexed events and R03 projection',async()=>{
  const h=harness(),first=await h.coordinator.accept(TOKEN,envelope());
  assert.equal(first.status,'completed');
  assert.equal(first.providerCalls,0);assert.equal(first.financialSaved,false);
  assert.equal(first.draft,null);
  assert.match(first.reply,/وعليكم السلام/);
  const s=await h.coordinator.history(TOKEN,historyRequest());
  assert.equal(s.revision,first.conversationRevision);
  assert.equal(s.turns.length,1);assert.equal(s.messages.length,2);
  assert.equal(s.tasks[0].state,'completed');
  assert.equal(s.uncertainOperations.length,0);
  assert.ok([...h.db.docs.keys()].some(key=>key.startsWith(R07J_COLLECTION)));
});
test('real coordinator safely creates only unsaved quote and resumes across instances',async()=>{
  const db=new SharedTransactionalFirestore(),first=harness(db);
  const req=envelope({requestId:'quote-request',idempotencyKey:'quote-key',
    userMessageId:'quote-user',message:'أنشئ مسودة عرض سعر',mode:'controller'});
  const created=await first.coordinator.accept(TOKEN,req);
  assert.equal(created.status,'completed');
  assert.equal(created.providerCalls,0);
  assert.equal(created.financialSaved,false);
  assert.equal(created.draft.kind,'quotation');
  assert.equal(created.draft.status,'needs_review');
  assert.equal(created.draft.draftRevision,1);
  assert.equal(created.draft.approvalReceiptId,null);
  assert.equal(created.draft.lineItems.length,0);
  const before=db.writes;
  const recovered=harness(db);
  const replay=await recovered.coordinator.accept(TOKEN,req);
  assert.equal(replay.replayed,true);
  assert.equal(replay.turnId,created.turnId);
  assert.equal(replay.conversationRevision,created.conversationRevision);
  assert.equal(replay.draft.immutableRevisionHash,created.draft.immutableRevisionHash);
  assert.equal(db.writes,before);
  const s=await recovered.coordinator.history(TOKEN,historyRequest());
  assert.equal(s.tasks[0].draftId,created.draft.draftId);
});
test('R07K same-key changed input refuses replay even after reconnect',async()=>{
  const h=harness();
  await h.coordinator.accept(TOKEN,envelope());
  await assert.rejects(
    harness(h.db).coordinator.accept(TOKEN,envelope({message:'مرحبا'})),
    /R07_TURN_IDEMPOTENCY_COLLISION/);
});
test('R07K failed draft storage cannot become completed task',async()=>{
  const db=new SharedTransactionalFirestore(),h=harness(db,{
    draftStore:{createIfAbsent:async()=>{throw Error('draft-store-outage');},
      read:async()=>null},
  });
  const request=envelope({requestId:'draft-outage',idempotencyKey:'draft-outage',
    userMessageId:'draft-outage-user',message:'أنشئ مسودة عرض سعر',mode:'controller'});
  await assert.rejects(h.coordinator.accept(TOKEN,request),/draft-store-outage/);
  const state=await h.coordinator.history(TOKEN,historyRequest());
  assert.equal(state.tasks[0].state,'processing');
  assert.equal(state.messages.filter(x=>x.role==='assistant').length,0);
  const recovered=harness(db);
  const out=await recovered.coordinator.accept(TOKEN,request);
  assert.equal(out.replayed,true);
  assert.equal(out.draft.status,'needs_review');
  assert.equal(out.financialSaved,false);
});
test('R07K ACL revocation blocks indexed history and idempotent replay',async()=>{
  const db=new SharedTransactionalFirestore();
  let enabled=true;
  const acl={readForActor:async()=>enabled?membership().readForActor({}):null};
  const h=harness(db,{membership:acl});
  await h.coordinator.accept(TOKEN,envelope());
  enabled=false;
  await assert.rejects(
    harness(db,{membership:acl}).coordinator.accept(TOKEN,envelope()),
    /AUTH_MEMBERSHIP_DENIED/);
  await assert.rejects(
    h.coordinator.history(TOKEN,historyRequest()),
    /AUTH_MEMBERSHIP_DENIED/);
});
test('R07K refuses unauthorized company and viewer-only quote creation',async()=>{
  const h=harness();
  await assert.rejects(h.coordinator.accept(TOKEN,envelope({companyId:'different'})),
    /AUTH_MEMBERSHIP_DENIED/);
  const viewer=harness(new SharedTransactionalFirestore(),{
    principal:principal('viewer'),membership:membership('viewer')});
  await assert.rejects(viewer.coordinator.accept(TOKEN,envelope({
    mode:'controller',message:'أنشئ مسودة عرض سعر',
  })),/R07_DRAFT_PREPARATION_DENIED/);
});
test('R07K two simultaneous identical greetings converge with at most one saved turn',async()=>{
  const db=new SharedTransactionalFirestore();
  const responses=await Promise.allSettled([
    harness(db).coordinator.accept(TOKEN,envelope()),
    harness(db).coordinator.accept(TOKEN,envelope()),
  ]);
  assert.equal(responses.filter(x=>x.status==='fulfilled').length>=1,true);
  const state=await harness(db).coordinator.history(TOKEN,historyRequest());
  assert.equal(state.turns.length,1);
  assert.equal(state.messages.length,2);
  assert.equal(state.tasks[0].state,'completed');
});
