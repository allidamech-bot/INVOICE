/**
 * R07H — true Firestore Emulator + firebase-admin E2E acceptance.
 * Fails fast unless a local emulator and an explicit demo project are used.
 * No live Firebase credentials, user data, real providers or financial writes.
 */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {R07GExperimentalShardedEventBackend,
  R07G_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-sharded-events.js';
import {ScopedConversationLedger}
  from '../../dist/src/ai-next/conversation-state/event-store.js';
import {exactScopeKey}
  from '../../dist/src/ai-next/domain/turn-journal.js';

const host=process.env.FIRESTORE_EMULATOR_HOST;
const project=process.env.GCLOUD_PROJECT??process.env.GOOGLE_CLOUD_PROJECT??'';
if(!/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host??'')||
  !/^demo-ai-next-r07h$/.test(project)){
  throw new Error('R07H_REQUIRES_LOCAL_FIRESTORE_EMULATOR_AND_DEMO_PROJECT');
}
const NOW='2026-10-31T00:00:00.000Z';
const clone=x=>structuredClone(x);
const scope={
  ownerUid:'emulator-owner',accountId:'emulator-account',
  companyId:'emulator-company',branchId:'emulator-branch',
  threadId:'emulator-r07h-thread',actorId:'emulator-owner',
  role:'owner',scopeType:'business',authorizationVersion:1,
};
const a=initializeApp({projectId:project},'r07h-admin-a');
const b=initializeApp({projectId:project},'r07h-admin-b');
after(async()=>{await Promise.all([deleteApp(a),deleteApp(b)]);});
const dbA=getFirestore(a),dbB=getFirestore(b);
const makeLedger=db=>new ScopedConversationLedger(
  new R07GExperimentalShardedEventBackend(db));
const first=()=>{
  const turn={
    schemaVersion:1,scope:clone(scope),turnId:'r07h-turn-1',
    threadId:scope.threadId,userMessageId:'r07h-user-1',
    requestId:'r07h-req-1',idempotencyKey:'r07h-turn-idem',
    sequenceNumber:1,parentTurnId:null,
    userMessage:{text:'مرحبا',languageHint:'ar',attachedSourceIds:[]},
    mode:'advisor',receivedAt:NOW,stateVersion:0,
    selectedSourceIds:[],taskId:'r07h-task-1',lifecycle:'received',
    outputResultId:null,
  };
  const task={
    schemaVersion:1,scope:clone(scope),taskId:'r07h-task-1',
    threadId:scope.threadId,turnId:'r07h-turn-1',
    taskType:'greeting',state:'created',revision:0,stateVersion:0,
    startedAt:NOW,updatedAt:NOW,completedAt:null,stageIndex:0,
    progress:{completedUnits:0,totalUnits:null,
      unitType:'unknown',observedAt:NOW},
    currentCheckpointId:null,sourceIds:[],draftId:null,approvalId:null,
    lastError:null,cancellable:true,retryPolicy:'safe_only',
    executionOperationId:null,
  };
  return {scope,expectedRevision:0,eventId:'r07h-start-event',
    idempotencyKey:'r07h-start-idempotency',
    body:{kind:'turn_started',turn,task},now:NOW};
};
const message=(revision,label='message')=>({
  scope,expectedRevision:revision,eventId:'r07h-event-'+revision,
  idempotencyKey:'r07h-idem-'+revision,
  body:{kind:'message',messageId:'r07h-message-'+revision,
    turnId:'r07h-turn-1',role:'assistant',
    text:label,sourceIds:[]},now:NOW,
});
test('real Firestore emulator persists >96 chained events across two SDK clients',async()=>{
  const ledgerA=makeLedger(dbA),ledgerB=makeLedger(dbB);
  assert.equal((await ledgerA.snapshot(scope)).revision,0);
  await ledgerA.append(first());
  for(let r=1;r<=98;r++){
    const ledger=r%2===0?ledgerB:ledgerA;
    const result=await ledger.append(message(r));
    assert.equal(result.snapshot.revision,r+1);
  }
  const snapshot=await ledgerB.snapshot(scope);
  assert.equal(snapshot.revision,99);
  assert.equal(snapshot.messages.length,98);
  assert.equal(snapshot.messages.at(-1).messageId,'r07h-message-98');
  const head=await dbB.collection(R07G_COLLECTION)
    .where('revision','==',99).get();
  assert.equal(head.size,1);
  assert.deepEqual(head.docs[0].data().chunks.map(x=>x.end),[96,99]);
  const writtenCount=(await dbA.collection(R07G_COLLECTION).get()).size;
  assert.equal(writtenCount,3);
  const replay=await ledgerA.append(message(98));
  assert.equal(replay.replayed,true);
  assert.equal(replay.snapshot.revision,99);
  assert.equal((await dbA.collection(R07G_COLLECTION).get()).size,writtenCount);
});
test('real Firestore SDK rejects an adjacent concurrent CAS writer',async()=>{
  const [left,right]=await Promise.allSettled([
    makeLedger(dbA).append(message(99,'winner-one')),
    makeLedger(dbB).append({
      ...message(99,'winner-two'),
      eventId:'r07h-alternate-99',idempotencyKey:'r07h-alternate-key-99',
      body:{kind:'message',messageId:'r07h-alternate-message-99',
        turnId:'r07h-turn-1',role:'assistant',
        text:'winner-two',sourceIds:[]},
    }),
  ]);
  assert.equal([left,right].filter(x=>x.status==='fulfilled').length,1);
  assert.equal([left,right].filter(x=>x.status==='rejected').length,1);
  assert.equal((await makeLedger(dbB).snapshot(scope)).revision,100);
});
test('real Firestore data is scope-isolated from thread and membership epochs',async()=>{
  for(const changed of [
    {ownerUid:'another-owner'},
    {companyId:'another-company'},
    {branchId:'another-branch'},
    {threadId:'another-thread'},
    {authorizationVersion:2},
  ]){
    const out=await makeLedger(dbB).snapshot({...scope,...changed});
    assert.equal(out.revision,0);
  }
  assert.ok((await dbB.collection(R07G_COLLECTION).get()).size>=3);
});
test('real Firestore refuses corrupted historical shard instead of truncating history',async()=>{
  const headSnapshot=await dbB.collection(R07G_COLLECTION)
    .where('revision','==',100).get();
  assert.equal(headSnapshot.size,1);
  const head=headSnapshot.docs[0],prefix=head.id.replace(/:head$/,'');
  assert.notEqual(prefix,head.id);
  const firstShard=dbB.collection(R07G_COLLECTION)
    .doc(prefix+':chunk:00000');
  const existing=await firstShard.get();
  assert.equal(existing.exists,true);
  const modified=existing.data();
  modified.events[0].body.turn.userMessage.text='tampered';
  await firstShard.set(modified);
  await assert.rejects(makeLedger(dbA).snapshot(scope),
    /R07G_CHUNK_HASH_MISMATCH/);
});
