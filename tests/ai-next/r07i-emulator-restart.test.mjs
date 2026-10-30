/**
 * R07I two independent official Firestore Emulator processes.
 *
 * The GitHub Actions workflow EXPORTS after seed, STOPS the emulator,
 * IMPORTS into a new emulator process and verifies before new append.
 * Never connects to a live project; requires synthetic demo project.
 */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {ScopedConversationLedger}
  from '../../dist/src/ai-next/conversation-state/event-store.js';
import {R07GExperimentalShardedEventBackend,R07G_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-sharded-events.js';
import {exactScopeKey}
  from '../../dist/src/ai-next/domain/turn-journal.js';

const host=process.env.FIRESTORE_EMULATOR_HOST;
const project=process.env.GCLOUD_PROJECT??process.env.GOOGLE_CLOUD_PROJECT;
const phase=process.env.R07I_PHASE;
if(!/^(localhost|127\.0\.0\.1):[0-9]{2,5}$/.test(host??'')||
  project!=='demo-ai-next-r07h'||!['seed','verify'].includes(phase))
  throw new Error('R07I_LOCAL_EMULATOR_DEMO_PROJECT_AND_PHASE_REQUIRED');

const NOW='2026-10-31T00:00:00.000Z';
const scope={ownerUid:'r07i-owner',accountId:'r07i-account',
  companyId:'r07i-company',branchId:'r07i-branch',threadId:'r07i-recovery-thread',
  actorId:'r07i-owner',role:'owner',scopeType:'business',authorizationVersion:1};
const app=initializeApp({projectId:project},'r07i-restart-'+phase);
after(async()=>{await deleteApp(app);});
const db=getFirestore(app);
const ledger=()=>new ScopedConversationLedger(new R07GExperimentalShardedEventBackend(db));
const backend=()=>new R07GExperimentalShardedEventBackend(db);
const key=exactScopeKey(scope);
const start=()=>{
  const turn={
    schemaVersion:1,scope:structuredClone(scope),turnId:'r07i-turn',
    threadId:scope.threadId,userMessageId:'r07i-user',
    requestId:'r07i-request',idempotencyKey:'r07i-turn-idem',
    sequenceNumber:1,parentTurnId:null,
    userMessage:{text:'مرحبا',languageHint:'ar',attachedSourceIds:[]},
    mode:'advisor',receivedAt:NOW,stateVersion:0,
    selectedSourceIds:[],taskId:'r07i-task',lifecycle:'received',
    outputResultId:null,
  };
  const task={schemaVersion:1,scope:structuredClone(scope),
    taskId:'r07i-task',threadId:scope.threadId,turnId:'r07i-turn',
    taskType:'greeting',state:'created',revision:0,stateVersion:0,
    startedAt:NOW,updatedAt:NOW,completedAt:null,stageIndex:0,
    progress:{completedUnits:0,totalUnits:null,unitType:'unknown',observedAt:NOW},
    currentCheckpointId:null,sourceIds:[],draftId:null,approvalId:null,
    lastError:null,cancellable:true,retryPolicy:'safe_only',
    executionOperationId:null};
  return {scope,expectedRevision:0,eventId:'r07i-start',
    idempotencyKey:'r07i-start-idem',
    body:{kind:'turn_started',turn,task},now:NOW};
};
const message=revision=>({
  scope,expectedRevision:revision,eventId:'r07i-event-'+revision,
  idempotencyKey:'r07i-event-idem-'+revision,
  body:{kind:'message',messageId:'r07i-message-'+revision,
    turnId:'r07i-turn',role:'assistant',
    text:'Synthetic recovery event '+revision,sourceIds:[]},
  now:NOW,
});
if(phase==='seed'){
  test('seed 105 durable events and display-only last 8',async()=>{
    const writer=ledger();
    await writer.append(start());
    for(let r=1;r<=104;r++)await writer.append(message(r));
    const state=await writer.snapshot(scope);
    assert.equal(state.revision,105);
    assert.equal(state.messages.length,104);
    const display=await backend().readRecentWindow(key,8);
    assert.equal(display.revision,105);
    assert.deepEqual(display.events.map(e=>e.sequence),
      [98,99,100,101,102,103,104,105]);
    assert.equal(display.completeHistory,false);
    assert.equal(display.authoritativeForMutation,false);
    assert.equal(display.lastHash,state.lastHash);
    assert.equal((await db.collection(R07G_COLLECTION).get()).size,3);
  });
}
if(phase==='verify'){
  test('new emulator process imports full history, idempotency and resumes',async()=>{
    const restored=ledger();
    const snapshot=await restored.snapshot(scope);
    assert.equal(snapshot.revision,105);
    assert.equal(snapshot.messages.length,104);
    assert.equal(snapshot.messages[0].messageId,'r07i-message-1');
    assert.equal(snapshot.messages.at(-1).messageId,'r07i-message-104');
    const window=await backend().readRecentWindow(key,8);
    assert.equal(window.lastHash,snapshot.lastHash);
    assert.equal(window.authoritativeForMutation,false);
    const replay=await restored.append(message(104));
    assert.equal(replay.replayed,true);
    assert.equal(replay.snapshot.revision,105);
    const appended=await restored.append(message(105));
    assert.equal(appended.replayed,false);
    assert.equal(appended.snapshot.revision,106);
    assert.equal(appended.snapshot.messages.length,105);
    assert.equal((await ledger().snapshot(scope)).revision,106);
    assert.equal((await db.collection(R07G_COLLECTION).get()).size,3);
  });
}
