/**
 * R07L two separate official Firestore Emulator processes:
 * seed -> export -> stop -> import -> verify and resume. Synthetic only.
 */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {R07JExperimentalIndexedJournal}
  from '../../dist/src/ai-next/storage/firestore-indexed-append.js';

const host=process.env.FIRESTORE_EMULATOR_HOST;
const project=process.env.GCLOUD_PROJECT??process.env.GOOGLE_CLOUD_PROJECT;
const phase=process.env.R07L_PHASE;
if(!/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host??'')||
  project!=='demo-ai-next-r07h'||!['seed','restore'].includes(phase))
  throw Error('R07L_STRICT_LOCAL_FIRESTORE_ONLY');

const app=initializeApp({projectId:project},'r07l-'+phase);
after(async()=>{await deleteApp(app);});
const db=getFirestore(app),store=new R07JExperimentalIndexedJournal(db);
const at='2026-10-31T14:00:00.000Z';
const scope={
  ownerUid:'r07l-owner',accountId:'r07l-account',
  companyId:'r07l-company',branchId:'r07l-branch',
  threadId:'r07l-history',actorId:'r07l-owner',role:'owner',
  scopeType:'business',authorizationVersion:1,
};
function begin(){
  const turn={schemaVersion:1,scope:structuredClone(scope),
    turnId:'r07l-turn',threadId:scope.threadId,userMessageId:'r07l-user',
    requestId:'r07l-request',idempotencyKey:'r07l-request-key',
    sequenceNumber:1,parentTurnId:null,
    userMessage:{text:'مرحبا',languageHint:'ar',attachedSourceIds:[]},
    mode:'advisor',receivedAt:at,stateVersion:0,selectedSourceIds:[],
    taskId:'r07l-task',lifecycle:'received',outputResultId:null};
  const task={schemaVersion:1,scope:structuredClone(scope),
    taskId:'r07l-task',threadId:scope.threadId,turnId:turn.turnId,
    taskType:'local_greeting',state:'created',revision:0,stateVersion:0,
    startedAt:at,updatedAt:at,completedAt:null,stageIndex:0,
    progress:{completedUnits:0,totalUnits:null,unitType:'unknown',observedAt:at},
    currentCheckpointId:null,sourceIds:[],draftId:null,approvalId:null,
    lastError:null,cancellable:true,retryPolicy:'safe_only',
    executionOperationId:null};
  return {scope,expectedRevision:0,eventId:'r07l-event-0',
    idempotencyKey:'r07l-idem-0',body:{kind:'turn_started',turn,task},now:at};
}
const message=n=>({scope,expectedRevision:n,
  eventId:'r07l-event-'+n,idempotencyKey:'r07l-idem-'+n,
  body:{kind:'message',messageId:'r07l-message-'+n,
    turnId:'r07l-turn',role:'assistant',text:'restorable message '+n,
    sourceIds:[]},now:at});
if(phase==='seed')test('seed 110 synthetic events with indexed operational state',async()=>{
  await store.append(begin());
  for(let n=1;n<=109;n++)await store.append(message(n));
  const fast=(await store.readOperationalState(scope)).view;
  assert.equal(fast.revision,110);
  assert.equal(fast.assistantReply.messageId,'r07l-message-109');
  assert.equal(fast.task.state,'created');
  const full=await store.auditFullHistory(scope);
  assert.equal(full.revision,fast.revision);
  assert.equal(full.lastHash,fast.lastHash);
});
if(phase==='restore')test('restart imports anchored state and allows idempotent resume',async()=>{
  const fresh=(await store.readOperationalState(scope)).view;
  assert.equal(fresh.revision,110);
  assert.equal(fresh.assistantReply.messageId,'r07l-message-109');
  const full=await store.auditFullHistory(scope);
  assert.equal(full.revision,110);
  assert.equal(full.lastHash,fresh.lastHash);
  const replay=await store.append(message(109));
  assert.equal(replay.replayed,true);
  assert.equal(replay.revision,110);
  const append=await store.append(message(110));
  assert.equal(append.revision,111);
  const after=(await store.readOperationalState(scope)).view;
  assert.equal(after.revision,111);
  assert.equal(after.assistantReply.text,'restorable message 110');
  const audited=await store.auditFullHistory(scope);
  assert.equal(audited.revision,after.revision);
  assert.equal(audited.lastHash,after.lastHash);
  assert.equal(audited.messages.length,110);
});
