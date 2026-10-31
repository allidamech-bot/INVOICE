/**
 * R07M↔R07D actual Firebase Admin/Firestore Emulator integration.
 * No production Firebase endpoint, secrets, customer documents or live AI.
 */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {R07MFastLocalCoordinator}
  from '../../dist/src/ai-next/coordinator/fast-local-coordinator.js';
import {R07JExperimentalIndexedJournal,R07M_FAST_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-indexed-append.js';
import {R07DExperimentalFirestoreDraftStore,
  R07D_EDIT_RECEIPT_COLLECTION,R07D_DRAFT_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';
import {createR07RTrustedOfflineReviewSession}
  from '../../dist/src/ai-next/coordinator/r07r-trusted-review-session.js';

const host=process.env.FIRESTORE_EMULATOR_HOST;
const project=process.env.GCLOUD_PROJECT??process.env.GOOGLE_CLOUD_PROJECT;
if(project!=='demo-ai-next-r07h'||
  !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host??''))
  throw Error('R07M_R07D_LOCAL_EMULATOR_DEMO_PROJECT_REQUIRED');
const appA=initializeApp({projectId:project},'r07m-r07d-a');
const appB=initializeApp({projectId:project},'r07m-r07d-b');
after(async()=>{await Promise.all([deleteApp(appA),deleteApp(appB)]);});
const dbA=getFirestore(appA),dbB=getFirestore(appB);
const DATE=new Date('2026-10-31T20:30:00.000Z');
const epoch=Math.floor(DATE.getTime()/1000);
const TOKEN='real-emulator-synthetic-token-without-live-credentials';
const scope=label=>({
  ownerUid:'r07m-r07d-owner',actorId:'r07m-r07d-owner',
  accountId:'r07m-r07d-account',companyId:'r07m-r07d-company',
  branchId:'r07m-r07d-branch',threadId:'r07m-r07d-'+label,
  role:'owner',scopeType:'business',authorizationVersion:1,
});
const input=(s,message,key)=>({
  schemaVersion:1,accountId:s.accountId,companyId:s.companyId,
  branchId:s.branchId,threadId:s.threadId,scopeType:s.scopeType,
  requestId:key,idempotencyKey:key,userMessageId:'user-'+key,
  message,mode:'controller',
});
function makeClient(db,flags={}){
  const principal={verify:async()=>({
    uid:'r07m-r07d-owner',role:'owner',anonymous:false,
    tokenIssuedAt:epoch-120,tokenExpiresAt:epoch+3600,
    authenticatedAt:epoch-240,
  })};
  const membership={readForActor:async()=>flags.revoked?null:{
    ownerUid:'r07m-r07d-owner',actorUid:'r07m-r07d-owner',
    accountId:'r07m-r07d-account',companyId:'r07m-r07d-company',
    branchId:'r07m-r07d-branch',active:true,authorizationVersion:1,
    permittedRoles:['owner'],
  }};
  const journal=new R07JExperimentalIndexedJournal(db,true);
  const drafts=new R07DExperimentalFirestoreDraftStore(db);
  let interpretations=0;
  const session=createR07RTrustedOfflineReviewSession({
    offlineFixtureMode:true,offlineReceiptMode:true,
    principal,membership,journal,draftStore:drafts,
    customers:{resolveUnique:async(_scope,name)=>
      name==='شركة النور'?'r07m-r07d-customer-id':null},
    syntheticInterpreter:{interpret:async()=>{
      interpretations++;
      return {
        action:'edit_draft',subject:null,reference:'active_draft',
        sourceIds:[],missingFields:[],
        facts:[{name:'customer_name',value:'شركة النور'}],
      };
    }},
    clock:()=>new Date(DATE),
  });
  const coordinator=new R07MFastLocalCoordinator({
    principal,membership,journal,draftStore:drafts,
    offlineSemanticPlanner:session.planner,
    allowOfflineSemanticFixtures:true,
    offlineReviewReceiptStore:drafts,
    allowOfflineReviewReceiptAudit:flags.auditEnabled!==false,
    allowOfflineVerifiedReviewReply:flags.replyEnabled!==false,
    clock:()=>new Date(DATE),
  });
  return {coordinator,session,journal,drafts,interpretations:()=>interpretations};
}
async function createScenario(label){
  const s=scope(label),a=makeClient(dbA),b=makeClient(dbB);
  const initial=await a.coordinator.accept(TOKEN,
    input(s,'أنشئ مسودة عرض سعر',label+'-origin'));
  const editTurn=input(s,'خلي العميل شركة النور',label+'-edit');
  const semantic=await a.coordinator.acceptOfflineSemantic(TOKEN,editTurn);
  const editInput={
    turn:editTurn,originTurnId:initial.turnId,
    expectedDraftRevision:initial.draft.draftRevision,
    expectedDraftHash:initial.draft.immutableRevisionHash,
  };
  return {s,a,b,initial,semantic,editInput};
}
const historyInput=s=>({
  schemaVersion:1,accountId:s.accountId,companyId:s.companyId,
  branchId:s.branchId,threadId:s.threadId,scopeType:s.scopeType,
});
test('real two-root edit receipt, lost ACK and audit recovery across Admin SDK clients',async()=>{
  const h=await createScenario('lost-ack');
  const edited=await h.a.session.bridge.prepareWithReceipt(TOKEN,h.editInput);
  assert.equal(edited.financialSaved,false);
  assert.equal(edited.appliedRevision,2);
  const historyBefore=await h.b.coordinator.history(TOKEN,historyInput(h.s));
  assert.equal(historyBefore.checkpointRefs.length,0);
  const recovered=await h.b.coordinator.linkOfflineReviewReceipt(
    TOKEN,h.editInput);
  assert.equal(recovered.status,'review_receipt_checkpointed');
  assert.equal(recovered.replayed,false);
  assert.equal(recovered.appliedDraftRevision,2);
  assert.equal(recovered.currentDraftRevision,2);
  assert.equal(recovered.appliedDraftHash,edited.appliedHash);
  assert.equal(recovered.draftEditPerformed,false);
  assert.equal(recovered.financialSaved,false);
  assert.equal(recovered.providerCalls,0);
  const record=await h.a.coordinator.history(TOKEN,historyInput(h.s));
  assert.equal(record.turns.length,2);
  assert.equal(record.tasks.every(t=>t.state==='completed'),true);
  assert.equal(record.checkpointRefs.length,1);
  assert.equal(record.checkpointRefs[0].taskId,h.semantic.taskId);
  assert.equal(record.checkpointRefs[0].referenceHash,edited.appliedHash);
  assert.equal((await h.b.drafts.read(h.s,h.initial.turnId)).draftRevision,2);
  const after=await h.a.coordinator.linkOfflineReviewReceipt(TOKEN,h.editInput);
  assert.equal(after.replayed,true);
  assert.equal(after.appliedDraftRevision,2);
  assert.equal((await h.a.coordinator.history(TOKEN,historyInput(h.s)))
    .checkpointRefs.length,1);
});
test('real two-client concurrent same-checkpoint attempts yield exactly one audit event',async()=>{
  const h=await createScenario('concurrent');
  await h.a.session.bridge.prepareWithReceipt(TOKEN,h.editInput);
  const results=await Promise.all([
    h.a.coordinator.linkOfflineReviewReceipt(TOKEN,h.editInput),
    h.b.coordinator.linkOfflineReviewReceipt(TOKEN,h.editInput),
  ]);
  assert.deepEqual(results.map(x=>x.replayed).sort(),[false,true]);
  assert.equal((await h.a.coordinator.history(TOKEN,historyInput(h.s)))
    .checkpointRefs.length,1);
  assert.equal((await h.b.drafts.read(h.s,h.initial.turnId)).draftRevision,2);
});
test('receipt not yet committed cannot create R07M checkpoint on real Firestore',async()=>{
  const h=await createScenario('missing-receipt');
  await assert.rejects(h.b.coordinator.linkOfflineReviewReceipt(
    TOKEN,h.editInput),/R07M_REVIEW_RECEIPT_NOT_VERIFIED/);
  assert.equal((await h.a.coordinator.history(TOKEN,historyInput(h.s)))
    .checkpointRefs.length,0);
});
test('altered revision fingerprint and foreign branch fail closed before checkpoint',async()=>{
  const h=await createScenario('tamper');
  await h.a.session.bridge.prepareWithReceipt(TOKEN,h.editInput);
  await assert.rejects(h.b.coordinator.linkOfflineReviewReceipt(TOKEN,{
    ...h.editInput,expectedDraftHash:'f'.repeat(64),
  }),/R07D_EDIT_REQUEST_COLLISION/);
  await assert.rejects(h.b.coordinator.linkOfflineReviewReceipt(TOKEN,{
    ...h.editInput,turn:{...h.editInput.turn,branchId:'other-branch'},
  }),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal((await h.a.coordinator.history(TOKEN,historyInput(h.s)))
    .checkpointRefs.length,0);
});
test('revoked membership cannot replay an earlier successful audit checkpoint',async()=>{
  const h=await createScenario('revoked');
  await h.a.session.bridge.prepareWithReceipt(TOKEN,h.editInput);
  await h.b.coordinator.linkOfflineReviewReceipt(TOKEN,h.editInput);
  const denied=makeClient(dbB,{revoked:true});
  await assert.rejects(denied.coordinator.linkOfflineReviewReceipt(
    TOKEN,h.editInput),/AUTH_MEMBERSHIP_DENIED/);
});
test('corrupt saved R07D receipt cannot be adopted by R07M as evidence',async()=>{
  const h=await createScenario('corrupt-receipt');
  await h.a.session.bridge.prepareWithReceipt(TOKEN,h.editInput);
  const col=await dbA.collection(R07D_EDIT_RECEIPT_COLLECTION).get();
  const match=col.docs.filter(x=>x.data().requestKey===h.editInput.turn.idempotencyKey);
  assert.equal(match.length,1);
  await match[0].ref.update({appliedHash:'f'.repeat(64)});
  await assert.rejects(h.b.coordinator.linkOfflineReviewReceipt(
    TOKEN,h.editInput),/R07D_EDIT_RECEIPT_DRAFT_DIVERGED/);
  assert.equal((await h.a.coordinator.history(TOKEN,historyInput(h.s)))
    .checkpointRefs.length,0);
  assert.ok((await dbB.collection(R07M_FAST_COLLECTION).get()).size>0);
  assert.ok((await dbB.collection(R07D_DRAFT_COLLECTION).get()).size>0);
});

test('official Firestore: independent client publishes receipt-verified chat reply after lost ACK',async()=>{
  const h=await createScenario('reply-recovery');
  const edited=await h.a.session.bridge.prepareWithReceipt(TOKEN,h.editInput);
  await h.a.coordinator.linkOfflineReviewReceipt(TOKEN,h.editInput);
  // The confirmation message did not commit. Recover on the other Admin app.
  const out=await h.b.coordinator.publishOfflineVerifiedReviewReply(
    TOKEN,h.editInput);
  assert.equal(out.replayed,false);
  assert.equal(out.appliedDraftHash,edited.appliedHash);
  assert.equal(out.appliedDraftRevision,2);
  assert.equal(out.financialSaved,false);
  assert.match(out.reply,/لم يتم إصدار عرض السعر/);
  const history=await h.a.coordinator.history(TOKEN,historyInput(h.s));
  const forTurn=history.messages.filter(m=>m.turnId===h.semantic.turnId&&
    m.role==='assistant');
  assert.equal(forTurn.length,2);
  assert.match(forTurn[0].text,/لم أطبّق أي تعديل/);
  assert.equal(forTurn[1].text,out.reply);
  const planned=await h.a.coordinator.acceptOfflineSemantic(TOKEN,
    h.editInput.turn);
  assert.equal(planned.semanticOutcome,'proposal_only');
  assert.equal(planned.draftEdited,false);
  assert.equal(planned.reply,forTurn[0].text);
  const repeat=await h.a.coordinator.publishOfflineVerifiedReviewReply(
    TOKEN,h.editInput);
  assert.equal(repeat.replayed,true);
  assert.equal(repeat.reply,out.reply);
  assert.equal((await h.b.coordinator.history(TOKEN,historyInput(h.s)))
    .messages.filter(m=>m.messageId===out.replyMessageId).length,1);
});
test('official Firestore: concurrently publishing verified confirmations is idempotent',async()=>{
  const h=await createScenario('reply-concurrent');
  await h.a.session.bridge.prepareWithReceipt(TOKEN,h.editInput);
  const both=await Promise.all([
    h.a.coordinator.publishOfflineVerifiedReviewReply(TOKEN,h.editInput),
    h.b.coordinator.publishOfflineVerifiedReviewReply(TOKEN,h.editInput),
  ]);
  assert.deepEqual(both.map(x=>x.replayed).sort(),[false,true]);
  const history=await h.b.coordinator.history(TOKEN,historyInput(h.s));
  assert.equal(history.checkpointRefs.length,1);
  assert.equal(history.messages.filter(m=>m.messageId===both[0].replyMessageId)
    .length,1);
});
