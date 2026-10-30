import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {R07JExperimentalIndexedJournal,R07J_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-indexed-append.js';
const project=process.env.GCLOUD_PROJECT??process.env.GOOGLE_CLOUD_PROJECT;
const host=process.env.FIRESTORE_EMULATOR_HOST;
if(project!=='demo-ai-next-r07h'||
  !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host??''))
  throw new Error('R07J_REAL_FIRESTORE_EMULATOR_GUARD');
const appA=initializeApp({projectId:project},'r07j-admin-A');
const appB=initializeApp({projectId:project},'r07j-admin-B');
after(async()=>Promise.all([deleteApp(appA),deleteApp(appB)]));
const dbA=getFirestore(appA),dbB=getFirestore(appB);
const a=new R07JExperimentalIndexedJournal(dbA);
const b=new R07JExperimentalIndexedJournal(dbB);
const now='2026-10-31T12:00:00.000Z';
const scope={ownerUid:'r07j-admin',accountId:'r07j-account',
  companyId:'r07j-company',branchId:'r07j-branch',threadId:'r07j-emulator-thread',
  actorId:'r07j-admin',role:'owner',scopeType:'business',authorizationVersion:1};
const initial=()=>{
  const turn={schemaVersion:1,scope:structuredClone(scope),
    turnId:'r07j-emulator-turn',threadId:scope.threadId,
    userMessageId:'r07j-u1',requestId:'r07j-req1',
    idempotencyKey:'turn-r07j-1',sequenceNumber:1,parentTurnId:null,
    userMessage:{text:'مرحبا',languageHint:'ar',attachedSourceIds:[]},
    mode:'advisor',receivedAt:now,stateVersion:0,
    selectedSourceIds:[],taskId:'r07j-emulator-task',lifecycle:'received',
    outputResultId:null};
  const task={schemaVersion:1,scope:structuredClone(scope),
    taskId:'r07j-emulator-task',threadId:scope.threadId,
    turnId:'r07j-emulator-turn',taskType:'conversation',state:'created',
    revision:0,stateVersion:0,startedAt:now,updatedAt:now,completedAt:null,
    stageIndex:0,progress:{completedUnits:0,totalUnits:null,
      unitType:'unknown',observedAt:now},currentCheckpointId:null,
    sourceIds:[],draftId:null,approvalId:null,lastError:null,
    cancellable:true,retryPolicy:'safe_only',executionOperationId:null};
  return {scope,expectedRevision:0,eventId:'r07j-start',
    idempotencyKey:'r07j-start-idem',body:{kind:'turn_started',turn,task},now};
};
const message=(revision)=>({scope,expectedRevision:revision,
  eventId:'r07j-event-'+revision,idempotencyKey:'r07j-idem-'+revision,
  body:{kind:'message',messageId:'r07j-msg-'+revision,
    turnId:'r07j-emulator-turn',role:'assistant',
    text:'Synthetic event '+revision,sourceIds:[]},now});
test('real Firestore transactions preserve 35 events and constant indexed receipt',async()=>{
  assert.equal((await a.auditFullHistory(scope)).revision,0);
  await a.append(initial());
  for(let i=1;i<=34;i++){
    const item=i%2?await b.append(message(i)):await a.append(message(i));
    assert.equal(item.revision,i+1);
    assert.equal(item.authoritativeFullSnapshot,false);
  }
  const audit=await b.auditFullHistory(scope);
  assert.equal(audit.revision,35);
  assert.equal(audit.messages.length,34);
  assert.equal(audit.messages.at(-1).messageId,'r07j-msg-34');
  const count=(await dbA.collection(R07J_COLLECTION).get()).size;
  assert.ok(count>=4*35);
  const replay=await a.append(message(34));
  assert.equal(replay.replayed,true);
  assert.equal(replay.revision,35);
  assert.equal((await dbB.collection(R07J_COLLECTION).get()).size,count);
});
test('real Firestore transaction CAS admits one competing client',async()=>{
  const [x,y]=await Promise.allSettled([
    a.append(message(35)),
    b.append({...message(35),
      eventId:'r07j-other-event',idempotencyKey:'r07j-other-idem',
      body:{kind:'message',messageId:'r07j-other-message',
        turnId:'r07j-emulator-turn',role:'assistant',
        text:'other',sourceIds:[]}}),
  ]);
  assert.equal([x,y].filter(r=>r.status==='fulfilled').length,1);
  assert.equal([x,y].filter(r=>r.status==='rejected').length,1);
  assert.equal((await a.auditFullHistory(scope)).revision,36);
});
test('real Firestore scope isolation and checksum audit failure',async()=>{
  assert.equal((await b.auditFullHistory({...scope,authorizationVersion:2})).revision,0);
  const row=await dbA.collection(R07J_COLLECTION)
    .where('sequence','==',35).get();
  // Includes one event, one eventId, one message index; choose the event itself.
  const target=row.docs.find(doc=>doc.id.includes(':event:'));
  assert.ok(target);
  const changed=target.data();changed.body.text='corrupted message';
  await target.ref.set(changed);
  await assert.rejects(b.auditFullHistory(scope),/AI_NEXT_DAMAGED_EVENT_HASH/);
});
