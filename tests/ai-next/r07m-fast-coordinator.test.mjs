import test from 'node:test';
import assert from 'node:assert/strict';
import {R07MFastLocalCoordinator,R07M_FAST_COORDINATOR_ACTIVATED}
  from '../../dist/src/ai-next/coordinator/fast-local-coordinator.js';
import {R07JExperimentalIndexedJournal,R07M_FAST_COLLECTION}
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
    if(![R07M_FAST_COLLECTION,R07D_DRAFT_COLLECTION].includes(name))
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
  const journal=new R07JExperimentalIndexedJournal(db,true);
  const draftStore=override.draftStore??new R07DExperimentalFirestoreDraftStore(db);
  const deps={journal,draftStore,principal:override.principal??principal(),
    membership:override.membership??membership(),clock:()=>new Date(NOW)};
  return {db,journal,draftStore,deps,
    coordinator:new R07MFastLocalCoordinator(deps)};
};
const TOKEN='signed-synthetic-token-not-a-live-account';

test('R07M remains disabled and enforces isolated new root',()=>{
  assert.equal(R07M_FAST_COORDINATOR_ACTIVATED,false);
  assert.equal(R07M_FAST_COLLECTION,'aiNextFastEventThreadsV1');
});
test('fast greeting and second greeting use operational state and sealed request index',async()=>{
  const h=harness();
  const first=await h.coordinator.accept(TOKEN,envelope());
  assert.equal(first.financialSaved,false);
  assert.equal(first.providerCalls,0);
  assert.match(first.reply,/وعليكم السلام/);
  const view=await h.coordinator.current(TOKEN,historyRequest());
  assert.equal(view.view.revision,6);
  assert.equal(view.view.task.state,'completed');
  assert.equal(view.completeHistory,false);
  const next=envelope({idempotencyKey:'second-key',requestId:'second-request',
    userMessageId:'second-user',message:'مرحبا'});
  const second=await harness(h.db).coordinator.accept(TOKEN,next);
  assert.equal(second.replayed,false);
  assert.notEqual(first.turnId,second.turnId);
  assert.equal((await h.coordinator.current(TOKEN,historyRequest())).view.turn.sequenceNumber,2);
  const history=await h.coordinator.history(TOKEN,historyRequest());
  assert.equal(history.turns.length,2);
  assert.equal(history.messages.length,4);
  assert.equal(history.tasks.every(t=>t.state==='completed'),true);
  const before=h.db.writes;
  const original=await harness(h.db).coordinator.accept(TOKEN,envelope());
  assert.equal(original.replayed,true);
  assert.equal(original.turnId,first.turnId);
  assert.equal(original.reply,first.reply);
  assert.equal(h.db.writes,before);
});
test('R07M bounded reads on new turn after 320 synthetic earlier events',async()=>{
  const h=harness();
  await h.coordinator.accept(TOKEN,envelope());
  const scope={ownerUid:'signed-r07k',accountId:'account-r07k',
    companyId:'company-r07k',branchId:'branch-r07k',
    threadId:'thread-r07k',actorId:'signed-r07k',role:'owner',
    scopeType:'business',authorizationVersion:1};
  let v=(await h.journal.readOperationalState(scope)).view;
  // Only synthetic later assistant events; do not invoke a paid provider.
  for(let n=0;n<320;n++){
    await h.journal.append({scope,expectedRevision:v.revision,
      eventId:'extra-'+n,idempotencyKey:'extra-'+n,
      body:{kind:'message',messageId:'extra-message-'+n,
        turnId:v.turn.turnId,role:'assistant',text:'synthetic '+n,sourceIds:[]},
      now:NOW.toISOString()});
    v=(await h.journal.readOperationalState(scope)).view;
  }
  const startReads=h.db.reads;
  const next=await h.coordinator.accept(TOKEN,envelope({
    idempotencyKey:'bounded-next',requestId:'bounded-next',
    userMessageId:'bounded-next-user',message:'مرحبا',
  }));
  const used=h.db.reads-startReads;
  assert.equal(next.status,'completed');
  assert.ok(used<140,'new Controller turn must not read 320 previous event docs');
  const current=(await h.coordinator.current(TOKEN,historyRequest())).view;
  assert.equal(current.turn.sequenceNumber,2);
  assert.equal(current.task.state,'completed');
});
test('R07M refuses collision of old request key after multiple other turns',async()=>{
  const h=harness();
  await h.coordinator.accept(TOKEN,envelope());
  await h.coordinator.accept(TOKEN,envelope({requestId:'second',
    idempotencyKey:'second',userMessageId:'second',
    message:'مرحبا'}));
  const count=h.db.writes;
  await assert.rejects(
    h.coordinator.accept(TOKEN,envelope({message:'مرحبا'})),
    /R07_TURN_IDEMPOTENCY_COLLISION/);
  assert.equal(h.db.writes,count);
  const old=await h.coordinator.accept(TOKEN,envelope());
  assert.equal(old.replayed,true);
  assert.equal(h.db.writes,count);
});
test('R07M quote persists only an unsaved review draft and resumes on new instance',async()=>{
  const h=harness();
  const req=envelope({mode:'controller',message:'أنشئ مسودة عرض سعر'});
  const first=await h.coordinator.accept(TOKEN,req);
  assert.equal(first.financialSaved,false);
  assert.equal(first.providerCalls,0);
  assert.equal(first.draft.kind,'quotation');
  assert.equal(first.draft.status,'needs_review');
  assert.equal(first.draft.draftRevision,1);
  assert.equal(first.draft.approvalReceiptId,null);
  const before=h.db.writes;
  const second=await harness(h.db).coordinator.accept(TOKEN,req);
  assert.equal(second.replayed,true);
  assert.equal(second.turnId,first.turnId);
  assert.equal(second.draft.immutableRevisionHash,first.draft.immutableRevisionHash);
  assert.equal(h.db.writes,before);
});
test('R07M draft outage stays processing then completes only after recovery',async()=>{
  const db=new SharedTransactionalFirestore(),h=harness(db,{
    draftStore:{createIfAbsent:async()=>{throw Error('offline-draft');},
      read:async()=>null},
  });
  const req=envelope({mode:'controller',message:'أنشئ مسودة عرض سعر'});
  await assert.rejects(h.coordinator.accept(TOKEN,req),/offline-draft/);
  const fast=await h.coordinator.current(TOKEN,historyRequest());
  assert.equal(fast.view.task.state,'processing');
  assert.equal(fast.view.assistantReply,null);
  const after=await harness(db).coordinator.accept(TOKEN,req);
  assert.equal(after.replayed,true);
  assert.equal(after.draft.status,'needs_review');
  assert.equal(after.financialSaved,false);
});
test('R07M duplicate concurrent requests converge to exactly one turn',async()=>{
  const db=new SharedTransactionalFirestore();
  const results=await Promise.allSettled([
    harness(db).coordinator.accept(TOKEN,envelope()),
    harness(db).coordinator.accept(TOKEN,envelope()),
  ]);
  assert.ok(results.some(x=>x.status==='fulfilled'));
  const h=harness(db);
  const full=await h.coordinator.history(TOKEN,historyRequest());
  assert.equal(full.turns.length,1);
  assert.equal(full.tasks[0].state,'completed');
  assert.equal(full.messages.length,2);
});
test('R07M rechecks authority on replay, operational state and audited history',async()=>{
  let active=true;
  const acl={readForActor:async()=>active?membership().readForActor({}):null};
  const h=harness(undefined,{membership:acl});
  await h.coordinator.accept(TOKEN,envelope());
  active=false;
  await assert.rejects(h.coordinator.accept(TOKEN,envelope()),
    /AUTH_MEMBERSHIP_DENIED/);
  await assert.rejects(h.coordinator.current(TOKEN,historyRequest()),
    /AUTH_MEMBERSHIP_DENIED/);
  await assert.rejects(h.coordinator.history(TOKEN,historyRequest()),
    /AUTH_MEMBERSHIP_DENIED/);
});
test('R07M denies unauthorized branch and viewer quote before indexed writes',async()=>{
  const h=harness();
  await assert.rejects(h.coordinator.accept(TOKEN,envelope({
    branchId:'forged'})),/AUTH_MEMBERSHIP_DENIED/);
  const viewer=harness(new SharedTransactionalFirestore(),{
    principal:principal('viewer'),membership:membership('viewer')});
  await assert.rejects(viewer.coordinator.accept(TOKEN,envelope({
    mode:'controller',message:'أنشئ مسودة عرض سعر',
  })),/R07_DRAFT_PREPARATION_DENIED/);
  assert.equal(viewer.db.writes,0);
});
