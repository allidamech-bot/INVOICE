/**
 * Real official Firestore Emulator + Firebase Admin transaction acceptance.
 * No credential, cloud connection, live customer or financial document.
 * Confirms R07D review edit and request receipt share one transaction.
 */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {R07DExperimentalFirestoreDraftStore,
  R07D_DRAFT_COLLECTION,R07D_EDIT_RECEIPT_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';
import {newReviewDraft,SyntheticDraftEditor}
  from '../../dist/src/ai-next/guarded-finance/drafts.js';

const host=process.env.FIRESTORE_EMULATOR_HOST;
const project=process.env.GCLOUD_PROJECT??process.env.GOOGLE_CLOUD_PROJECT;
if(project!=='demo-ai-next-r07h'||
  !/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host??''))
  throw Error('R07R_RECEIPT_LOCAL_EMULATOR_AND_DEMO_PROJECT_REQUIRED');
const a=initializeApp({projectId:project},'r07r-receipts-admin-A');
const b=initializeApp({projectId:project},'r07r-receipts-admin-B');
after(async()=>{await Promise.all([deleteApp(a),deleteApp(b)]);});
const dbA=getFirestore(a),dbB=getFirestore(b);
const storeA=new R07DExperimentalFirestoreDraftStore(dbA);
const storeB=new R07DExperimentalFirestoreDraftStore(dbB);
const NOW='2026-10-31T20:00:00.000Z';
const scoped=threadId=>({
  ownerUid:'emulator-review-owner',actorId:'emulator-review-owner',
  accountId:'emulator-review-account',companyId:'emulator-review-company',
  branchId:'emulator-review-branch',threadId,
  role:'owner',scopeType:'business',authorizationVersion:1,
});
const hash=(char)=>char.repeat(64);
async function seed(label){
  const scope=scoped('emulator-review-'+label),turnId='origin-'+label;
  const draft=await newReviewDraft({
    scope,draftId:'draft-'+turnId,kind:'quotation',sourceIds:[],
    sourceManifestHash:hash('0'),lineItems:[],customerId:null,
    currency:null,now:NOW,
  });
  await storeA.createIfAbsent(scope,turnId,draft);
  return {scope,turnId,draft};
}
async function nextDraft(draft,customerId='verified-customer'){
  const editor=await SyntheticDraftEditor.resume(draft);
  return editor.edit({expectedRevision:draft.draftRevision,
    change:{kind:'set_customer',customerId},now:NOW});
}
const request=(seed,next,requestKey,fingerprint=hash('a'))=>({
  scope:seed.scope,turnId:seed.turnId,requestKey,
  requestFingerprint:fingerprint,
  expectedRevision:seed.draft.draftRevision,
  expectedHash:seed.draft.immutableRevisionHash,next,
});
test('two real Admin SDK clients persist atomic draft edit and loss-of-ACK receipt',async()=>{
  const initial=await seed('lost-ack'),next=await nextDraft(initial.draft);
  const args=request(initial,next,'lost-ack-key');
  const first=await storeA.replaceReviewRevisionWithReceipt(args);
  assert.equal(first.replayed,false);
  assert.equal(first.receipt.appliedRevision,2);
  assert.equal(first.draft.draftRevision,2);
  assert.equal(first.draft.status,'needs_review');
  assert.equal(first.draft.approvalReceiptId,null);
  const originalDraft=await storeB.read(initial.scope,initial.turnId);
  assert.equal(originalDraft.immutableRevisionHash,first.receipt.appliedHash);
  const replay=await storeB.readEditReceipt(args);
  assert.equal(replay.replayed,true);
  assert.equal(replay.receipt.appliedRevision,2);
  assert.equal(replay.draft.immutableRevisionHash,first.draft.immutableRevisionHash);
  const second=await storeB.replaceReviewRevisionWithReceipt(args);
  assert.equal(second.replayed,true);
  assert.equal(second.draft.draftRevision,2);
});
test('same-key concurrent requests on two SDK clients produce ONE committed review revision',async()=>{
  const original=await seed('same-key'),next=await nextDraft(original.draft);
  const args=request(original,next,'single-key');
  const res=await Promise.allSettled([
    storeA.replaceReviewRevisionWithReceipt(args),
    storeB.replaceReviewRevisionWithReceipt(args),
  ]);
  assert.equal(res.filter(x=>x.status==='fulfilled').length,2);
  assert.deepEqual(res.filter(x=>x.status==='fulfilled').map(x=>x.value.replayed).sort(),
    [false,true]);
  assert.equal((await storeB.read(original.scope,original.turnId)).draftRevision,2);
});
test('different keys on same revision cannot silently overwrite another writer',async()=>{
  const original=await seed('different-key');
  const left=await nextDraft(original.draft,'customer-left');
  const right=await nextDraft(original.draft,'customer-right');
  const out=await Promise.allSettled([
    storeA.replaceReviewRevisionWithReceipt(request(original,left,'key-left',hash('b'))),
    storeB.replaceReviewRevisionWithReceipt(request(original,right,'key-right',hash('c'))),
  ]);
  assert.equal(out.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(out.filter(x=>x.status==='rejected').length,1);
  const committed=await storeA.read(original.scope,original.turnId);
  assert.equal(committed.draftRevision,2);
  assert.ok(['customer-left','customer-right'].includes(committed.explicitCustomerId));
});
test('receipt preserves applied revision after a later independent edit and detects collision',async()=>{
  const first=await seed('later-edits'),revised=await nextDraft(first.draft);
  const firstArgs=request(first,revised,'immutable-first',hash('d'));
  await storeA.replaceReviewRevisionWithReceipt(firstArgs);
  const committed=await storeB.read(first.scope,first.turnId);
  const next=await nextDraft(committed,'customer-second');
  await storeB.replaceReviewRevisionWithReceipt({
    scope:first.scope,turnId:first.turnId,requestKey:'independent-second',
    requestFingerprint:hash('e'),expectedRevision:committed.draftRevision,
    expectedHash:committed.immutableRevisionHash,next,
  });
  const old=await storeA.readEditReceipt(firstArgs);
  assert.equal(old.receipt.appliedRevision,2);
  assert.equal(old.draft.draftRevision,3);
  assert.equal(old.draft.explicitCustomerId,'customer-second');
  await assert.rejects(storeB.readEditReceipt({
    ...firstArgs,requestFingerprint:hash('f'),
  }),/R07D_EDIT_REQUEST_COLLISION/);
});
test('foreign tenant and corrupted receipt are rejected before returning any claimed edit',async()=>{
  const initial=await seed('isolation'),next=await nextDraft(initial.draft);
  const args=request(initial,next,'isolation-key');
  await storeA.replaceReviewRevisionWithReceipt(args);
  const foreign=await storeB.readEditReceipt({
    ...args,scope:{...initial.scope,companyId:'foreign-company'},
  });
  assert.equal(foreign,null);
  const receiptQuery=await dbA.collection(R07D_EDIT_RECEIPT_COLLECTION).get();
  const matching=receiptQuery.docs.filter(d=>d.data().turnId===initial.turnId);
  assert.equal(matching.length,1);
  await matching[0].ref.update({appliedHash:hash('f')});
  await assert.rejects(storeB.readEditReceipt(args),
    /R07D_EDIT_RECEIPT_DRAFT_DIVERGED/);
  const drafts=await dbB.collection(R07D_DRAFT_COLLECTION).get();
  assert.ok(drafts.size>=5);
});
