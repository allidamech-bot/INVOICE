import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {R07KIndexedCoordinatorLedger}
  from '../../dist/src/ai-next/coordinator/indexed-ledger-bridge.js';
import {R07LocalCoordinator}
  from '../../dist/src/ai-next/coordinator/local-coordinator.js';
import {R07JExperimentalIndexedJournal,R07J_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-indexed-append.js';
import {R07DExperimentalFirestoreDraftStore,R07D_DRAFT_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';

const host=process.env.FIRESTORE_EMULATOR_HOST;
const project=process.env.GCLOUD_PROJECT??process.env.GOOGLE_CLOUD_PROJECT;
if(project!=='demo-ai-next-r07h'||
  !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host??''))
  throw Error('R07K_LOCAL_EMULATOR_AND_DEMO_PROJECT_REQUIRED');
const appA=initializeApp({projectId:project},'r07k-A');
const appB=initializeApp({projectId:project},'r07k-B');
after(async()=>{await Promise.all([deleteApp(appA),deleteApp(appB)]);});
const dba=getFirestore(appA),dbb=getFirestore(appB);
const date=new Date('2026-10-31T14:00:00.000Z'),now=Math.floor(date.getTime()/1000);
const principal={verify:async()=>({uid:'r07k-signed-owner',role:'owner',
  tokenIssuedAt:now-30,tokenExpiresAt:now+3600,
  authenticatedAt:now-60,anonymous:false})};
let allowed=true;
const membership={readForActor:async()=>allowed?({
  ownerUid:'r07k-signed-owner',actorUid:'r07k-signed-owner',
  accountId:'r07k-account',companyId:'r07k-company',
  branchId:'r07k-branch',active:true,authorizationVersion:3,
  permittedRoles:['owner']}):null};
const api=db=>new R07LocalCoordinator({
  ledger:new R07KIndexedCoordinatorLedger(new R07JExperimentalIndexedJournal(db)),
  draftStore:new R07DExperimentalFirestoreDraftStore(db),
  principal,membership,clock:()=>new Date(date),
});
const history={
  schemaVersion:1,accountId:'r07k-account',companyId:'r07k-company',
  branchId:'r07k-branch',threadId:'r07k-emulator-session',
  scopeType:'business',
};
const greeting={...history,requestId:'r07k-greeting',
  idempotencyKey:'r07k-greeting-key',userMessageId:'r07k-greeting-user',
  message:'السلام عليكم',mode:'advisor'};
const quotation={...history,requestId:'r07k-quote',
  idempotencyKey:'r07k-quote-key',userMessageId:'r07k-quote-user',
  message:'أنشئ مسودة عرض سعر',mode:'controller'};
const TOKEN='synthetic-firebase-token-never-live';
test('R07K distinct Firebase Admin clients share durable greeting and quote lifecycle',async()=>{
  const first=await api(dba).accept(TOKEN,greeting);
  assert.equal(first.status,'completed');
  assert.equal(first.financialSaved,false);
  assert.equal(first.providerCalls,0);
  assert.match(first.reply,/وعليكم السلام/);
  const resume=await api(dbb).accept(TOKEN,greeting);
  assert.equal(resume.replayed,true);
  assert.equal(resume.turnId,first.turnId);
  const drafted=await api(dbb).accept(TOKEN,quotation);
  assert.equal(drafted.status,'completed');
  assert.equal(drafted.draft.kind,'quotation');
  assert.equal(drafted.draft.status,'needs_review');
  assert.equal(drafted.draft.approvalReceiptId,null);
  assert.equal(drafted.financialSaved,false);
  const replayed=await api(dba).accept(TOKEN,quotation);
  assert.equal(replayed.replayed,true);
  assert.equal(replayed.draft.immutableRevisionHash,
    drafted.draft.immutableRevisionHash);
  const snapshot=await api(dba).history(TOKEN,history);
  assert.equal(snapshot.turns.length,2);
  assert.equal(snapshot.messages.length,4);
  assert.ok(snapshot.tasks.every(t=>t.state==='completed'));
  const indices=await dba.collection(R07J_COLLECTION).get();
  const drafts=await dbb.collection(R07D_DRAFT_COLLECTION).get();
  assert.ok(indices.size>=12);
  assert.equal(drafts.size,1);
});
test('R07K re-authorizes every replay and historical read after membership revocation',async()=>{
  allowed=false;
  await assert.rejects(api(dbb).accept(TOKEN,quotation),
    /AUTH_MEMBERSHIP_DENIED/);
  await assert.rejects(api(dba).history(TOKEN,history),
    /AUTH_MEMBERSHIP_DENIED/);
});
