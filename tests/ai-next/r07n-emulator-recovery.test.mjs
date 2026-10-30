import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {R07MFastLocalCoordinator}
  from '../../dist/src/ai-next/coordinator/fast-local-coordinator.js';
import {R07JExperimentalIndexedJournal,R07M_FAST_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-indexed-append.js';
import {R07DExperimentalFirestoreDraftStore}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';
import {R07NPreviewSession}
  from '../../dist/src/ai-next/ui/r07n-preview-session.js';

const host=process.env.FIRESTORE_EMULATOR_HOST;
const project=process.env.GCLOUD_PROJECT??process.env.GOOGLE_CLOUD_PROJECT;
const phase=process.env.R07N_PHASE;
if(project!=='demo-ai-next-r07h'||
  !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host??'')||
  !['seed','restore'].includes(phase))
  throw Error('R07N_STRICT_LOCAL_EMULATOR_GUARD');
const app=initializeApp({projectId:project},'r07n-'+phase);
after(async()=>{await deleteApp(app);});
const db=getFirestore(app);
const date=new Date('2026-10-31T15:00:00.000Z');
const now=Math.floor(date.getTime()/1000);
const scope={ownerUid:'r07n-signed-owner',actorId:'r07n-signed-owner',
  accountId:'r07n-account',companyId:'r07n-company',
  branchId:'r07n-branch',threadId:'r07n-recovery-session',
  role:'owner',scopeType:'business',authorizationVersion:1};
const envelope={schemaVersion:1,
  accountId:scope.accountId,companyId:scope.companyId,
  branchId:scope.branchId,threadId:scope.threadId,
  scopeType:scope.scopeType};
const quote={...envelope,requestId:'r07n-recovery-request',
  idempotencyKey:'r07n-recovery-idem',userMessageId:'r07n-recovery-user',
  message:'أنشئ مسودة عرض سعر',mode:'controller'};
const token='synthetic-verified-server-token';
let permitted=true;
const principal={verify:async()=>({uid:scope.ownerUid,role:'owner',
  tokenIssuedAt:now-30,tokenExpiresAt:now+3600,
  authenticatedAt:now-90,anonymous:false})};
const membership={readForActor:async()=>permitted?{
  ownerUid:scope.ownerUid,actorUid:scope.ownerUid,
  accountId:scope.accountId,companyId:scope.companyId,
  branchId:scope.branchId,active:true,
  authorizationVersion:1,permittedRoles:['owner'],
}:null};
const make=(fault=false)=>new R07MFastLocalCoordinator({
  journal:new R07JExperimentalIndexedJournal(db,true),
  draftStore:fault?{
    createIfAbsent:async()=>{throw Error('R07N_SIMULATED_DRAFT_STORAGE_OUTAGE');},
    read:async()=>null,
  }:new R07DExperimentalFirestoreDraftStore(db),
  principal,membership,clock:()=>new Date(date),
});
const identity=()=>({requestId:quote.requestId,
  idempotencyKey:quote.idempotencyKey,userMessageId:quote.userMessageId});
const makePreview=coordinator=>new R07NPreviewSession(scope,envelope,{
  accept:request=>coordinator.accept(token,request),
  current:request=>coordinator.current(token,request),
  history:request=>coordinator.history(token,request),
},identity);
const send=preview=>preview.send({
  text:quote.message,mode:'controller',sourceIds:[],
});
if(phase==='seed'){
  test('seed Firestore: interrupted unsaved draft remains nonterminal for recovery',async()=>{
    const coordinator=make(true);
    await assert.rejects(coordinator.accept(token,quote),
      /R07N_SIMULATED_DRAFT_STORAGE_OUTAGE/);
    const status=await coordinator.current(token,envelope);
    assert.equal(status.view.task.state,'processing');
    assert.equal(status.view.userMessageSeen,true);
    assert.equal(status.view.assistantReply,null);
    assert.equal(status.authoritativeForFinancialExecution,false);
    const full=await coordinator.history(token,envelope);
    assert.equal(full.turns.length,1);
    assert.equal(full.tasks[0].state,'processing');
    assert.equal(full.messages.length,1);
  });
}
if(phase==='restore'){
  test('new emulator process restores interrupted Controller task and preview retries same key',async()=>{
    const coordinator=make();
    const old=await coordinator.current(token,envelope);
    assert.equal(old.view.task.state,'processing');
    const preview=makePreview(coordinator);
    const result=await send(preview);
    assert.deepEqual(result,{accepted:true});
    assert.equal(preview.getView().draft.kind,'quotation');
    assert.equal(preview.getView().draft.status,'needs_review');
    assert.equal(preview.getView().draft.approvalReceiptId,null);
    assert.equal(preview.getView().currentTask.state,'completed');
    const another=await coordinator.accept(token,quote);
    assert.equal(another.replayed,true);
    assert.equal(another.financialSaved,false);
    assert.equal(another.providerCalls,0);
    const full=await coordinator.history(token,envelope);
    assert.equal(full.turns.length,1);
    assert.equal(full.tasks[0].state,'completed');
    assert.equal(full.messages.length,2);
    const saved=await coordinator.current(token,envelope);
    assert.equal(saved.view.lastHash,full.lastHash);
  });
  test('local emulator restart: revoked ACL blocks fresh status and replay',async()=>{
    permitted=false;
    await assert.rejects(make().current(token,envelope),/AUTH_MEMBERSHIP_DENIED/);
    await assert.rejects(make().accept(token,quote),/AUTH_MEMBERSHIP_DENIED/);
    await assert.rejects(make().history(token,envelope),/AUTH_MEMBERSHIP_DENIED/);
    permitted=true;
  });
  test('privileged index corruption fails closed without silently starting duplicate turn',async()=>{
    const query=await db.collection(R07M_FAST_COLLECTION)
      .where('requestKey','==',quote.idempotencyKey).get();
    assert.equal(query.docs.length,1);
    const ref=query.docs[0].ref;
    const original=query.docs[0].data();
    await ref.set({...original,eventHash:'f'.repeat(64)});
    await assert.rejects(make().accept(token,quote),
      /R07M_REQUEST_EVENT_MISMATCH/);
    const full=await make().history(token,envelope);
    assert.equal(full.turns.length,1);
    await ref.set(original);
    assert.equal((await make().accept(token,quote)).replayed,true);
  });
}
