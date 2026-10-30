import test from 'node:test';
import assert from 'node:assert/strict';
import {
  R07ExperimentalFirestoreEventBackend,R07_MAX_THREAD_BYTES,
  R07_MAX_THREAD_EVENTS,R07_PRODUCTION_STORAGE_ACTIVATED,
} from '../../dist/src/ai-next/storage/firestore-event-backend.js';
import {ScopedConversationLedger} from '../../dist/src/ai-next/conversation-state/event-store.js';
import {exactScopeKey} from '../../dist/src/ai-next/domain/turn-journal.js';

const NOW='2026-10-30T15:00:00.000Z';
const scope={
  ownerUid:'synthetic-uid',accountId:'synthetic-account',
  companyId:'synthetic-company',branchId:'synthetic-branch',
  threadId:'synthetic-thread',actorId:'synthetic-uid',
  role:'owner',scopeType:'business',authorizationVersion:1,
};
const copy=x=>structuredClone(x);
class SharedMockFirestore{
  records=new Map();
  chain=Promise.resolve();
  commits=0;
  collection(name){
    assert.equal(name,'aiNextEventThreadsV1');
    return {doc:id=>({
      id,
      get:async()=>this.snapshot(id),
    })};
  }
  snapshot(id){
    const entry=this.records.get(id);
    return {exists:entry!==undefined,data:()=>copy(entry)};
  }
  async runTransaction(work){
    const previous=this.chain;
    let release;const next=new Promise(resolve=>{release=resolve;});
    this.chain=previous.then(()=>next);
    await previous;
    try{
      const writes=new Map();
      const tx={
        get:async ref=>this.snapshot(ref.id),
        set:(ref,val)=>writes.set(ref.id,copy(val)),
      };
      const result=await work(tx);
      for(const [id,val] of writes){this.records.set(id,val);this.commits++;}
      return result;
    }finally{release();}
  }
}
function newTurn(id='turn-1',key='idem-1'){
  const taskId='task-'+id;
  const turn={
    schemaVersion:1,scope:copy(scope),turnId:id,threadId:scope.threadId,
    userMessageId:'message-'+id,requestId:'request-'+id,idempotencyKey:key,
    sequenceNumber:1,parentTurnId:null,
    userMessage:{text:'السلام عليكم',languageHint:'ar',attachedSourceIds:[]},
    mode:'advisor',receivedAt:NOW,stateVersion:0,selectedSourceIds:[],
    taskId,lifecycle:'received',outputResultId:null,
  };
  const task={
    schemaVersion:1,scope:copy(scope),taskId,turnId:id,threadId:scope.threadId,
    taskType:'conversation',state:'created',revision:0,stateVersion:0,
    startedAt:NOW,updatedAt:NOW,completedAt:null,stageIndex:0,
    progress:{completedUnits:0,totalUnits:null,unitType:'unknown',observedAt:NOW},
    currentCheckpointId:null,sourceIds:[],draftId:null,approvalId:null,
    lastError:null,cancellable:true,retryPolicy:'safe_only',executionOperationId:null,
  };
  return {scope,expectedRevision:0,eventId:'event-'+id,
    idempotencyKey:key,body:{kind:'turn_started',turn,task},now:NOW};
}
test('experimental backend has no production activation flag',()=>{
  assert.equal(R07_PRODUCTION_STORAGE_ACTIVATED,false);
  assert.ok(R07_MAX_THREAD_BYTES<1_000_000);
  assert.ok(R07_MAX_THREAD_EVENTS<=300);
});
test('real R03 ledger persists mock-backed event across independent instances',async()=>{
  const db=new SharedMockFirestore();
  const first=new ScopedConversationLedger(new R07ExperimentalFirestoreEventBackend(db));
  const second=new ScopedConversationLedger(new R07ExperimentalFirestoreEventBackend(db));
  const output=await first.append(newTurn());
  assert.equal(output.replayed,false);
  assert.equal(output.snapshot.turns.length,1);
  assert.equal((await second.snapshot(scope)).turns[0].turnId,'turn-1');
  assert.equal(db.commits,1);
});
test('exact replay across new process does not add another committed event',async()=>{
  const db=new SharedMockFirestore();
  const a=new ScopedConversationLedger(new R07ExperimentalFirestoreEventBackend(db));
  const b=new ScopedConversationLedger(new R07ExperimentalFirestoreEventBackend(db));
  const request=newTurn();
  await a.append(request);
  const response=await b.append(request);
  assert.equal(response.replayed,true);
  assert.equal(db.commits,1);
  assert.equal(response.snapshot.revision,1);
});
test('parallel writes against same thread are serializable and never duplicate',async()=>{
  const db=new SharedMockFirestore();
  const a=new ScopedConversationLedger(new R07ExperimentalFirestoreEventBackend(db));
  const b=new ScopedConversationLedger(new R07ExperimentalFirestoreEventBackend(db));
  const outcomes=await Promise.allSettled([
    a.append(newTurn('turn-A','idem-A')),
    b.append(newTurn('turn-B','idem-B')),
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  assert.equal(db.commits,1);
  assert.equal((await a.snapshot(scope)).turns.length,1);
});
test('different company, UID or branch cannot access a thread record',async()=>{
  const db=new SharedMockFirestore(),store=new R07ExperimentalFirestoreEventBackend(db);
  const service=new ScopedConversationLedger(store);
  await service.append(newTurn());
  for(const override of [
    {companyId:'different'},{ownerUid:'other'},{branchId:'other'},
    {accountId:'other'},{actorId:'other'},{authorizationVersion:2},
  ]){
    const snapshot=await service.snapshot({...scope,...override});
    assert.equal(snapshot.turns.length,0);
  }
});
test('malformed caller scope key is rejected before Firestore access',async()=>{
  const db=new SharedMockFirestore(),store=new R07ExperimentalFirestoreEventBackend(db);
  for(const key of ['not-json',JSON.stringify(['bad']),JSON.stringify([...JSON.parse(exactScopeKey(scope)),null])]){
    await assert.rejects(store.read(key),/R07_SCOPE_KEY_INVALID/);
  }
});
test('append-only guard stops revisions that overwrite previous events',async()=>{
  const db=new SharedMockFirestore(),store=new R07ExperimentalFirestoreEventBackend(db);
  const ledger=new ScopedConversationLedger(store);
  await ledger.append(newTurn());
  await assert.rejects(store.transact(exactScopeKey(scope),async existing=>({
    next:{revision:2,events:[{fake:true},...existing.events]},result:'bad',
  })),/R07_INVALID_APPEND_ONLY_TRANSITION/);
  assert.equal(db.commits,1);
});
test('strict byte cap protects Firestore from oversized event document',async()=>{
  const db=new SharedMockFirestore(),store=new R07ExperimentalFirestoreEventBackend(db);
  const service=new ScopedConversationLedger(store);
  const hugeText='x'.repeat(R07_MAX_THREAD_BYTES);
  const request=newTurn();
  request.body.turn.userMessage.text=hugeText;
  await assert.rejects(service.append(request),/AI_NEXT_INVALID_CONTRACT|AI_NEXT_INVALID_TURN|AI_NEXT_/);
  assert.equal(db.commits,0);
});
test('idempotent callback runs once despite transactional persistence boundary',async()=>{
  const db=new SharedMockFirestore(),store=new R07ExperimentalFirestoreEventBackend(db);
  let count=0;
  await store.transact(exactScopeKey(scope),async existing=>{
    count++;
    return {next:existing,result:1};
  });
  assert.equal(count,1);
  assert.equal(db.commits,0);
});
test('server record tampering with mismatched authority is rejected',async()=>{
  const db=new SharedMockFirestore(),store=new R07ExperimentalFirestoreEventBackend(db);
  const ledger=new ScopedConversationLedger(store);
  await ledger.append(newTurn());
  for(const [id,doc] of db.records)db.records.set(id,{...doc,scopeKey:'other-company'});
  await assert.rejects(ledger.snapshot(scope),/R07_STORED_RECORD_INVALID/);
});
