import test from 'node:test';
import assert from 'node:assert/strict';
import {R07MFastLocalCoordinator}
  from '../../dist/src/ai-next/coordinator/fast-local-coordinator.js';
import {createR07RTrustedOfflineReviewSession}
  from '../../dist/src/ai-next/coordinator/r07r-trusted-review-session.js';
import {R07JExperimentalIndexedJournal,R07M_FAST_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-indexed-append.js';
import {R07DExperimentalFirestoreDraftStore,
  R07D_DRAFT_COLLECTION,R07D_EDIT_RECEIPT_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';

const NOW=new Date('2026-10-31T19:30:00.000Z'),epoch=Math.floor(NOW.getTime()/1000);
const TOKEN='offline-idempotent-r07r-test-token-long-enough';
const scope={ownerUid:'receipt-owner',actorId:'receipt-owner',
  accountId:'receipt-account',companyId:'receipt-company',
  branchId:'receipt-branch',threadId:'receipt-thread',
  role:'owner',scopeType:'business',authorizationVersion:1};
const input=(message='خلي العميل شركة النور',id='same-request',changes={})=>({
  schemaVersion:1,accountId:scope.accountId,companyId:scope.companyId,
  branchId:scope.branchId,threadId:scope.threadId,scopeType:'business',
  requestId:id,idempotencyKey:id,userMessageId:id+'-message',
  message,mode:'controller',...changes,
});
const clone=x=>structuredClone(x);
class DB {
  records=new Map();writes=0;reads=0;lock=Promise.resolve();
  collection(name){
    if(![R07M_FAST_COLLECTION,R07D_DRAFT_COLLECTION,
      R07D_EDIT_RECEIPT_COLLECTION].includes(name))throw Error('UNEXPECTED_ROOT');
    return {doc:id=>({id:name+'/'+id,get:async()=>this.snapshot(name+'/'+id)})};
  }
  snapshot(id){
    this.reads++;
    const found=this.records.get(id);
    return {exists:found!==undefined,data:()=>found===undefined?undefined:clone(found)};
  }
  async runTransaction(fn){
    const prev=this.lock;let release;
    this.lock=prev.then(()=>new Promise(resolve=>{release=resolve;}));
    await prev;
    try{
      const changes=new Map();
      const tx={
        get:async ref=>this.snapshot(ref.id),
        create:(ref,value)=>{
          if(this.records.has(ref.id)||changes.has(ref.id))
            throw Error('ALREADY_EXISTS');
          changes.set(ref.id,clone(value));
        },
        set:(ref,value)=>changes.set(ref.id,clone(value)),
      };
      const out=await fn(tx);
      for(const [id,value] of changes){
        this.records.set(id,value);this.writes++;
      }
      return out;
    }finally{release();}
  }
}
function setup(db=new DB(),options={}){
  let calls=0,authChecks=0;
  const principal={verify:async()=>{authChecks++;return {
    uid:'receipt-owner',role:'owner',tokenIssuedAt:epoch-100,
    tokenExpiresAt:epoch+3600,authenticatedAt:epoch-200,anonymous:false,
  };}};
  const membership={readForActor:async()=>options.revoked?null:{
    ownerUid:'receipt-owner',actorUid:'receipt-owner',
    accountId:scope.accountId,companyId:scope.companyId,
    branchId:scope.branchId,active:true,authorizationVersion:1,
    permittedRoles:['owner'],
  }};
  const journal=new R07JExperimentalIndexedJournal(db,true);
  const draftStore=new R07DExperimentalFirestoreDraftStore(db);
  const coordinator=new R07MFastLocalCoordinator({
    principal,membership,journal,draftStore,clock:()=>new Date(NOW),
  });
  const session=createR07RTrustedOfflineReviewSession({
    offlineFixtureMode:true,
    offlineReceiptMode:options.receiptsEnabled===false?undefined:true,
    principal,membership,journal,draftStore,
    customers:{resolveUnique:async(_scope,name)=>
      name==='شركة النور'?'known-customer-id':null},
    syntheticInterpreter:{interpret:async request=>{
      calls++;
      if(options.failInterpret)throw Error('MODEL_OFFLINE_FIXTURE_FAILURE');
      return options.overrideCandidate??{
        action:'edit_draft',subject:null,reference:'active_draft',
        sourceIds:[],missingFields:[],
        facts:request.message.includes('السعر')?
          [{name:'operation',value:'append_line'},
            {name:'description',value:'sample bottles'},
            {name:'quantity',value:'2'},{name:'unit',value:'PCS'},
            {name:'selling_unit_price',value:'15'},{name:'currency',value:'USD'}]:
          [{name:'customer_name',value:'شركة النور'}],
      };
    }},
    clock:()=>new Date(NOW),
  });
  const create=()=>coordinator.accept(TOKEN,input('أنشئ مسودة عرض سعر','origin-quote'));
  const edit=(draft,turn=input(),originTurnId='')=>session.bridge.prepareWithReceipt(
    TOKEN,{turn,originTurnId,expectedDraftRevision:draft.draftRevision,
      expectedDraftHash:draft.immutableRevisionHash});
  return {db,journal,draftStore,session,coordinator,principal,membership,create,edit,
    calls:()=>calls,authChecks:()=>authChecks};
}
const receiptKeys=db=>[...db.records.keys()].filter(k=>
  k.startsWith(R07D_EDIT_RECEIPT_COLLECTION+'/'));

test('receipt mode is opt-in; standard R07R edit and finance remain isolated',async()=>{
  const h=setup(undefined,{receiptsEnabled:false}),created=await h.create();
  await assert.rejects(h.edit(created.draft,input(),' '+created.turnId),
    /R07R_RECEIPTS_DISABLED/);
  assert.equal(receiptKeys(h.db).length,0);
});
test('commit edit and receipt in one transaction; no financial record issued',async()=>{
  const h=setup(),created=await h.create();
  const before=h.db.writes;
  const out=await h.edit(created.draft,input(),created.turnId);
  assert.equal(out.replayed,false);
  assert.equal(out.state,'unsaved_review_revision');
  assert.equal(out.appliedRevision,2);
  assert.equal(out.currentRevision,2);
  assert.equal(out.draft.explicitCustomerId,'known-customer-id');
  assert.equal(out.financialSaved,false);
  assert.equal(out.draft.approvalReceiptId,null);
  assert.equal(out.draft.kind,'quotation');
  assert.equal(h.db.writes-before,2);
  assert.equal(receiptKeys(h.db).length,1);
});
test('network lost after commit: repeat across independent instance returns receipt without model call',async()=>{
  const db=new DB(),a=setup(db),created=await a.create();
  const first=await a.edit(created.draft,input(),created.turnId);
  assert.equal(first.appliedRevision,2);
  const writes=db.writes,b=setup(db);
  const repeat=await b.edit(created.draft,input(),created.turnId);
  assert.equal(repeat.state,'already_applied');
  assert.equal(repeat.replayed,true);
  assert.equal(repeat.appliedRevision,2);
  assert.equal(repeat.appliedHash,first.appliedHash);
  assert.equal(repeat.draft.immutableRevisionHash,first.draft.immutableRevisionHash);
  assert.equal(b.calls(),0,'replay must not spend an inference call');
  assert.equal(db.writes,writes);
});
test('same request key with different message is collision, not a new modification',async()=>{
  const h=setup(),created=await h.create();
  await h.edit(created.draft,input(),created.turnId);
  const writes=h.db.writes;
  await assert.rejects(h.edit(created.draft,input('عدّل العميل شركة ثانية'),
    created.turnId),/R07D_EDIT_REQUEST_COLLISION/);
  assert.equal(h.db.writes,writes);
});
test('prior receipt remains verifiable after later independent revision',async()=>{
  const h=setup(),created=await h.create();
  const first=await h.edit(created.draft,input(),created.turnId);
  const second=await h.edit(first.draft,input('العميل شركة النور','second-key'),
    created.turnId);
  assert.equal(second.appliedRevision,3);
  const replay=await setup(h.db).edit(created.draft,input(),created.turnId);
  assert.equal(replay.state,'already_applied');
  assert.equal(replay.appliedRevision,2);
  assert.equal(replay.currentRevision,3);
  assert.equal(replay.draft.draftRevision,3);
  assert.equal(replay.appliedHash,first.appliedHash);
});
test('concurrent same key creates exactly one receipt, one draft increment',async()=>{
  const h=setup(),created=await h.create();
  const a=setup(h.db),b=setup(h.db);
  const outcomes=await Promise.allSettled([
    a.edit(created.draft,input(),created.turnId),
    b.edit(created.draft,input(),created.turnId),
  ]);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,0);
  assert.equal(outcomes.filter(x=>x.value.replayed===false).length,1);
  assert.equal(outcomes.filter(x=>x.value.replayed===true).length,1);
  const current=await h.draftStore.read(scope,created.turnId);
  assert.equal(current.draftRevision,2);
  assert.equal(receiptKeys(h.db).length,1);
});
test('concurrent different key same base revision rejects stale loser and prevents lost update',async()=>{
  const h=setup(),created=await h.create();
  const a=setup(h.db),b=setup(h.db);
  const outcomes=await Promise.allSettled([
    a.edit(created.draft,input('خلي العميل شركة النور','key-a'),created.turnId),
    b.edit(created.draft,input('خلي العميل شركة النور','key-b'),created.turnId),
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  assert.equal((await h.draftStore.read(scope,created.turnId)).draftRevision,2);
  assert.equal(receiptKeys(h.db).length,1);
});
test('failed synthetic interpreter has no receipt and no draft edit',async()=>{
  const h=setup(),created=await h.create(),failing=setup(h.db,{failInterpret:true});
  const before=h.db.writes;
  await assert.rejects(failing.edit(created.draft,input(),created.turnId),
    /MODEL_OFFLINE_FIXTURE_FAILURE/);
  assert.equal(h.db.writes,before);
  assert.equal(receiptKeys(h.db).length,0);
});
test('revocation and branch spoofing deny receipt replay before storage access',async()=>{
  const h=setup(),created=await h.create();
  await h.edit(created.draft,input(),created.turnId);
  const invalid=setup(h.db,{revoked:true}),reads=h.db.reads;
  await assert.rejects(invalid.edit(created.draft,input(),created.turnId),
    /AUTH_MEMBERSHIP_DENIED/);
  assert.equal(h.db.reads,reads);
  const forged=setup(h.db);
  await assert.rejects(forged.edit(created.draft,input('خلي العميل شركة النور',
    'same-request',{branchId:'foreign-branch'}),created.turnId),
    /AUTH_MEMBERSHIP_DENIED/);
});
test('corrupt receipt fails closed before model calls or draft writes',async()=>{
  const h=setup(),created=await h.create();
  await h.edit(created.draft,input(),created.turnId);
  const key=receiptKeys(h.db)[0];
  const bad=clone(h.db.records.get(key));bad.appliedHash='f'.repeat(64);
  bad.injectedAuthority=true;h.db.records.set(key,bad);
  const fresh=setup(h.db),writes=h.db.writes;
  await assert.rejects(fresh.edit(created.draft,input(),created.turnId),
    /R07D_CORRUPT_EDIT_RECEIPT/);
  assert.equal(fresh.calls(),0);
  assert.equal(h.db.writes,writes);
});
test('origin turn mismatch cannot attach an edit receipt to another draft',async()=>{
  const h=setup(),created=await h.create();
  await assert.rejects(h.edit(created.draft,input(),'foreign-origin'),
    /R07R_RECEIPT_DRAFT_REFERENCE_MISMATCH/);
  assert.equal(receiptKeys(h.db).length,0);
});


function auditCoordinator(h,options={}){
  return new R07MFastLocalCoordinator({
    journal:h.journal,draftStore:h.draftStore,
    principal:h.principal,membership:h.membership,
    clock:()=>new Date(NOW),
    offlineSemanticPlanner:h.session.planner,
    allowOfflineSemanticFixtures:true,
    offlineReviewReceiptStore:h.draftStore,
    allowOfflineReviewReceiptAudit:options.enabled!==false,
  });
}
const auditInput=(created,turn=input())=>({
  turn,originTurnId:created.turnId,
  expectedDraftRevision:created.draft.draftRevision,
  expectedDraftHash:created.draft.immutableRevisionHash,
});
test('R07M only checkpoints an already committed R07D receipt; never edits a draft itself',async()=>{
  const h=setup(),created=await h.create();
  const c=auditCoordinator(h);
  const operation=input();
  const semantic=await c.acceptOfflineSemantic(TOKEN,operation);
  assert.equal(semantic.financialSaved,false);
  const args=auditInput(created,operation);
  const before=h.db.writes;
  await assert.rejects(c.linkOfflineReviewReceipt(TOKEN,args),
    /R07M_REVIEW_RECEIPT_NOT_VERIFIED/);
  assert.equal(h.db.writes,before);
  assert.equal((await c.history(TOKEN,{schemaVersion:1,
    accountId:scope.accountId,companyId:scope.companyId,
    branchId:scope.branchId,threadId:scope.threadId,scopeType:'business'}))
    .checkpointRefs.length,0);
  const edited=await h.edit(created.draft,operation,created.turnId);
  const beforeLink=h.db.writes;
  const linked=await c.linkOfflineReviewReceipt(TOKEN,args);
  assert.equal(linked.status,'review_receipt_checkpointed');
  assert.equal(linked.appliedDraftRevision,2);
  assert.equal(linked.currentDraftRevision,2);
  assert.equal(linked.appliedDraftHash,edited.appliedHash);
  assert.equal(linked.financialSaved,false);
  assert.equal(linked.draftEditPerformed,false);
  assert.equal(linked.providerCalls,0);
  assert.equal(h.db.writes-beforeLink>0,true);
  const history=await c.history(TOKEN,{schemaVersion:1,
    accountId:scope.accountId,companyId:scope.companyId,
    branchId:scope.branchId,threadId:scope.threadId,scopeType:'business'});
  assert.equal(history.turns.length,2);
  assert.equal(history.tasks.length,2);
  assert.equal(history.tasks.at(-1).state,'completed');
  assert.equal(history.checkpointRefs.length,1);
  assert.equal(history.checkpointRefs[0].taskId,semantic.taskId);
  assert.equal(history.checkpointRefs[0].referenceHash,edited.appliedHash);
  assert.equal(history.checkpointRefs[0].sourceIds.length,0);
  assert.equal((await h.draftStore.read(scope,created.turnId)).draftRevision,2);
});
test('crash between R07D edit receipt and R07M checkpoint is reconciled by a new instance',async()=>{
  const h=setup(),created=await h.create();
  const first=auditCoordinator(h),turn=input();
  await first.acceptOfflineSemantic(TOKEN,turn);
  const edited=await h.edit(created.draft,turn,created.turnId);
  const next=setup(h.db),independent=auditCoordinator(next);
  const firstLink=await independent.linkOfflineReviewReceipt(
    TOKEN,auditInput(created,turn));
  assert.equal(firstLink.replayed,false);
  const writes=h.db.writes;
  const repeat=await auditCoordinator(setup(h.db)).linkOfflineReviewReceipt(
    TOKEN,auditInput(created,turn));
  assert.equal(repeat.replayed,true);
  assert.equal(repeat.appliedDraftHash,edited.appliedHash);
  assert.equal(repeat.currentDraftRevision,2);
  assert.equal(h.db.writes,writes);
  assert.equal(next.calls(),0,'receipt reconciliation must not invoke a provider');
});
test('parallel checkpoint retry on the same semantic task writes exactly one R07M event',async()=>{
  const h=setup(),created=await h.create();
  const turn=input();await auditCoordinator(h).acceptOfflineSemantic(TOKEN,turn);
  await h.edit(created.draft,turn,created.turnId);
  const left=auditCoordinator(setup(h.db)),right=auditCoordinator(setup(h.db));
  const [a,b]=await Promise.all([
    left.linkOfflineReviewReceipt(TOKEN,auditInput(created,turn)),
    right.linkOfflineReviewReceipt(TOKEN,auditInput(created,turn)),
  ]);
  assert.equal([a.replayed,b.replayed].filter(Boolean).length,1);
  assert.equal((await h.journal.auditFullHistory(scope)).checkpointRefs.length,1);
});
test('changed request or receipt fingerprint does not forge an R07M checkpoint',async()=>{
  const h=setup(),created=await h.create();
  const turn=input();
  await auditCoordinator(h).acceptOfflineSemantic(TOKEN,turn);
  await h.edit(created.draft,turn,created.turnId);
  const before=h.db.writes;
  await assert.rejects(auditCoordinator(h).linkOfflineReviewReceipt(TOKEN,
    auditInput(created,input('غير العميل',turn.requestId))),
    /R07M_REVIEW_TURN_NOT_VERIFIED/);
  const altered=auditInput(created,turn);
  altered.expectedDraftHash='f'.repeat(64);
  await assert.rejects(auditCoordinator(h).linkOfflineReviewReceipt(TOKEN,altered),
    /R07D_EDIT_REQUEST_COLLISION/);
  assert.equal(h.db.writes,before);
});
test('offline receipt checkpoint feature is server-disabled by default',async()=>{
  const h=setup(),created=await h.create();
  await assert.rejects(auditCoordinator(h,{enabled:false})
    .linkOfflineReviewReceipt(TOKEN,auditInput(created)),
    /R07M_REVIEW_RECEIPT_AUDIT_DISABLED/);
});
test('review receipt checkpoint rejects revoked membership before any receipt read',async()=>{
  const h=setup(),created=await h.create();const turn=input();
  await auditCoordinator(h).acceptOfflineSemantic(TOKEN,turn);
  await h.edit(created.draft,turn,created.turnId);
  const revoked=setup(h.db,{revoked:true}),reader=auditCoordinator(revoked);
  const before=h.db.reads,writes=h.db.writes;
  await assert.rejects(reader.linkOfflineReviewReceipt(
    TOKEN,auditInput(created,turn)),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal(h.db.reads,before);
  assert.equal(h.db.writes,writes);
});
test('cannot attach R07R receipt to a deterministic greeting or uncompleted task',async()=>{
  const h=setup(),created=await h.create();
  await h.coordinator.accept(TOKEN,input('السلام عليكم','greeting-only',{
    mode:'advisor',
  }));
  const d=auditInput(created,input('السلام عليكم','greeting-only',{
    mode:'advisor',
  }));
  await assert.rejects(auditCoordinator(h).linkOfflineReviewReceipt(TOKEN,d),
    /R07M_REVIEW_AUDIT_DENIED/);
});


const confirmedCoordinator=(h,options={})=>new R07MFastLocalCoordinator({
  journal:h.journal,draftStore:h.draftStore,
  principal:h.principal,membership:h.membership,
  clock:()=>new Date(NOW),
  offlineSemanticPlanner:h.session.planner,
  allowOfflineSemanticFixtures:true,
  offlineReviewReceiptStore:h.draftStore,
  allowOfflineReviewReceiptAudit:true,
  allowOfflineVerifiedReviewReply:options.enabled!==false,
});
const requestFor=(created,turn=input())=>({
  turn,originTurnId:created.turnId,
  expectedDraftRevision:created.draft.draftRevision,
  expectedDraftHash:created.draft.immutableRevisionHash,
});
const auditHistoryInput={
  schemaVersion:1,accountId:scope.accountId,companyId:scope.companyId,
  branchId:scope.branchId,threadId:scope.threadId,scopeType:'business',
};
test('disabled verified review acknowledgement does not inspect or mutate storage',async()=>{
  const h=setup(),created=await h.create();
  const before=h.db.reads;
  await assert.rejects(confirmedCoordinator(h,{enabled:false})
    .publishOfflineVerifiedReviewReply(TOKEN,requestFor(created)),
    /R07M_VERIFIED_REVIEW_REPLY_DISABLED/);
  assert.equal(h.db.reads,before);
});
test('never says applied without R07D receipt; keeps original proposal message unchanged',async()=>{
  const h=setup(),created=await h.create(),turn=input();
  const c=confirmedCoordinator(h);
  const original=await c.acceptOfflineSemantic(TOKEN,turn);
  assert.match(original.reply,/لم أطبّق أي تعديل/);
  const before=h.db.writes;
  await assert.rejects(c.publishOfflineVerifiedReviewReply(TOKEN,
    requestFor(created,turn)),/R07M_REVIEW_RECEIPT_NOT_VERIFIED/);
  assert.equal(h.db.writes,before);
  const history=await c.history(TOKEN,auditHistoryInput);
  assert.equal(history.messages.filter(x=>x.role==='assistant').length,2);
  assert.equal(history.checkpointRefs.length,0);
});
test('receipt-verified second reply is durable, preserves original proposal and never issues finance',async()=>{
  const h=setup(),created=await h.create(),turn=input(),c=confirmedCoordinator(h);
  const planning=await c.acceptOfflineSemantic(TOKEN,turn);
  const edited=await h.edit(created.draft,turn,created.turnId);
  const confirmed=await c.publishOfflineVerifiedReviewReply(
    TOKEN,requestFor(created,turn));
  assert.equal(confirmed.status,'verified_review_reply_published');
  assert.equal(confirmed.appliedDraftRevision,2);
  assert.equal(confirmed.appliedDraftHash,edited.appliedHash);
  assert.equal(confirmed.financialSaved,false);
  assert.equal(confirmed.draftEditPerformed,false);
  assert.equal(confirmed.providerCalls,0);
  assert.match(confirmed.reply,/تم إثبات تطبيق تعديل/);
  assert.match(confirmed.reply,/لم يتم إصدار عرض السعر/);
  const history=await c.history(TOKEN,auditHistoryInput);
  const transcript=history.messages.filter(x=>x.role==='assistant');
  assert.equal(transcript.length,3);
  assert.equal(transcript[1].text,planning.reply);
  assert.equal(transcript[2].text,confirmed.reply);
  assert.equal(transcript[2].messageId,confirmed.replyMessageId);
  assert.equal(history.checkpointRefs.length,1);
  assert.equal(history.tasks.at(-1).state,'completed');
  const prior=await c.acceptOfflineSemantic(TOKEN,turn);
  assert.equal(prior.reply,planning.reply,'proposal-only API must not pretend it executed edit');
  assert.equal(prior.semanticOutcome,'proposal_only');
  assert.equal(prior.draftEdited,false);
  assert.equal((await h.draftStore.read(scope,created.turnId)).draftRevision,2);
});
test('restart after checkpoint but before reply: second server publishes one confirmation',async()=>{
  const h=setup(),created=await h.create(),turn=input();
  await confirmedCoordinator(h).acceptOfflineSemantic(TOKEN,turn);
  await h.edit(created.draft,turn,created.turnId);
  await confirmedCoordinator(h).linkOfflineReviewReceipt(
    TOKEN,requestFor(created,turn));
  const after=confirmedCoordinator(setup(h.db));
  const confirmed=await after.publishOfflineVerifiedReviewReply(TOKEN,
    requestFor(created,turn));
  assert.equal(confirmed.replayed,false);
  const count=(await after.history(TOKEN,auditHistoryInput))
    .messages.filter(m=>m.messageId===confirmed.replyMessageId).length;
  assert.equal(count,1);
  const writes=h.db.writes;
  const replay=await confirmedCoordinator(setup(h.db))
    .publishOfflineVerifiedReviewReply(TOKEN,requestFor(created,turn));
  assert.equal(replay.replayed,true);
  assert.equal(replay.reply,confirmed.reply);
  assert.equal(h.db.writes,writes);
});
test('two simultaneous confirmations produce only one assistant message',async()=>{
  const h=setup(),created=await h.create(),turn=input();
  await confirmedCoordinator(h).acceptOfflineSemantic(TOKEN,turn);
  await h.edit(created.draft,turn,created.turnId);
  const [left,right]=await Promise.all([
    confirmedCoordinator(setup(h.db)).publishOfflineVerifiedReviewReply(
      TOKEN,requestFor(created,turn)),
    confirmedCoordinator(setup(h.db)).publishOfflineVerifiedReviewReply(
      TOKEN,requestFor(created,turn)),
  ]);
  assert.deepEqual([left.replayed,right.replayed].sort(),[false,true]);
  const history=await h.journal.auditFullHistory(scope);
  assert.equal(history.checkpointRefs.length,1);
  assert.equal(history.messages.filter(m=>m.messageId===left.replyMessageId).length,1);
});
test('earlier receipt acknowledgement never claims later draft revision as its own',async()=>{
  const h=setup(),created=await h.create(),turn=input();
  const c=confirmedCoordinator(h);await c.acceptOfflineSemantic(TOKEN,turn);
  const first=await h.edit(created.draft,turn,created.turnId);
  const second=await h.edit(first.draft,
    input('العميل شركة النور','next-revision'),created.turnId);
  assert.equal(second.appliedRevision,3);
  const out=await c.publishOfflineVerifiedReviewReply(
    TOKEN,requestFor(created,turn));
  assert.equal(out.appliedDraftRevision,2);
  assert.match(out.reply,/المراجعة رقم 2/);
  assert.match(out.reply,/قد تكون هناك مراجعات أحدث/);
  assert.equal((await h.draftStore.read(scope,created.turnId)).draftRevision,3);
});
test('cannot append an older unseen confirmation after a later user turn',async()=>{
  const h=setup(),created=await h.create(),turn=input();
  const c=confirmedCoordinator(h);await c.acceptOfflineSemantic(TOKEN,turn);
  await h.edit(created.draft,turn,created.turnId);
  await c.accept(TOKEN,input('السلام عليكم','greeting-after-review'));
  await assert.rejects(c.publishOfflineVerifiedReviewReply(TOKEN,
    requestFor(created,turn)),/R07M_REVIEW_REPLY_OUT_OF_ORDER/);
  const history=await c.history(TOKEN,auditHistoryInput);
  assert.equal(history.messages.filter(m=>m.messageId.startsWith(
    'review-confirmation-')).length,0);
});
test('revoked membership and corrupted R07D edit receipt never publish',async()=>{
  const h=setup(),created=await h.create(),turn=input();
  const c=confirmedCoordinator(h);await c.acceptOfflineSemantic(TOKEN,turn);
  await h.edit(created.draft,turn,created.turnId);
  const revoked=confirmedCoordinator(setup(h.db,{revoked:true}));
  const before=h.db.reads;
  await assert.rejects(revoked.publishOfflineVerifiedReviewReply(TOKEN,
    requestFor(created,turn)),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal(h.db.reads,before);
  const key=receiptKeys(h.db)[0],corrupted=clone(h.db.records.get(key));
  corrupted.appliedHash='f'.repeat(64);h.db.records.set(key,corrupted);
  await assert.rejects(confirmedCoordinator(setup(h.db))
    .publishOfflineVerifiedReviewReply(TOKEN,requestFor(created,turn)),
    /R07D_EDIT_RECEIPT_DRAFT_DIVERGED/);
  assert.equal((await c.history(TOKEN,auditHistoryInput)).messages.filter(
    m=>m.messageId.startsWith('review-confirmation-')).length,0);
});


function unified(h,options={}){
  return new R07MFastLocalCoordinator({
    journal:h.journal,draftStore:h.draftStore,
    principal:h.principal,membership:h.membership,
    clock:()=>new Date(NOW),
    offlineReviewBridge:options.bridge??h.session.bridge,
    offlineReviewReceiptStore:h.draftStore,
    allowOfflineUnifiedReviewEdit:options.enabled!==false,
  });
}
const unifiedHistoryInput={
  schemaVersion:1,accountId:scope.accountId,companyId:scope.companyId,
  branchId:scope.branchId,threadId:scope.threadId,scopeType:'business',
};
test('unified review edit is disabled unless explicitly server-constructed',async()=>{
  const h=setup();
  const before=h.db.reads;
  await assert.rejects(unified(h,{enabled:false})
    .acceptOfflineUnifiedReviewEdit(TOKEN,{bad:true}),
  /R07M_UNIFIED_REVIEW_DISABLED/);
  assert.equal(h.db.reads,before);
});
test('one R07M task, one final grounded reply, no provisional semantic message',async()=>{
  const h=setup(),created=await h.create();
  const result=await unified(h).acceptOfflineUnifiedReviewEdit(
    TOKEN,auditInput(created));
  assert.equal(result.status,'applied_unsaved_review');
  assert.equal(result.appliedDraftRevision,2);
  assert.equal(result.financialSaved,false);
  assert.equal(result.providerCalls,0);
  const history=await unified(h).history(TOKEN,unifiedHistoryInput);
  assert.equal(history.tasks.length,2);
  assert.equal(history.tasks[1].taskType,'unsaved_review_edit');
  assert.equal(history.tasks[1].state,'completed');
  assert.equal(history.messages.filter(m=>m.turnId===result.turnId&&
    m.role==='assistant').length,1);
  assert.equal(history.checkpointRefs.filter(c=>c.taskId===result.taskId).length,2);
  assert.equal((await h.draftStore.read(scope,created.turnId)).draftRevision,2);
  const writes=h.db.writes,restarted=setup(h.db);
  const prior=await unified(restarted).acceptOfflineUnifiedReviewEdit(
    TOKEN,auditInput(created));
  assert.equal(prior.replayed,true);
  assert.equal(prior.appliedDraftRevision,2);
  assert.equal(prior.reply,result.reply);
  assert.equal(restarted.calls(),0,'replay must not interpret');
  assert.equal(h.db.writes,writes);
});
test('lost acknowledgement after R07D commit recovers same edit on new process',async()=>{
  const h=setup(),created=await h.create(),request=auditInput(created);
  const broken=unified(h,{bridge:{
    prepareWithReceipt:async(token,raw)=>{
      await h.session.bridge.prepareWithReceipt(token,raw);
      throw Error('NETWORK_LOST_AFTER_R07D_COMMIT');
    },
  }});
  await assert.rejects(broken.acceptOfflineUnifiedReviewEdit(TOKEN,request),
    /NETWORK_LOST_AFTER_R07D_COMMIT/);
  assert.equal((await h.draftStore.read(scope,created.turnId)).draftRevision,2);
  const other=setup(h.db);
  const recovered=await unified(other).acceptOfflineUnifiedReviewEdit(
    TOKEN,request);
  assert.equal(recovered.status,'applied_unsaved_review');
  assert.equal(recovered.appliedDraftRevision,2);
  assert.equal(other.calls(),0,'committed receipt bypasses interpretation');
  const history=await other.journal.auditFullHistory(scope);
  assert.equal(history.messages.filter(m=>m.turnId===recovered.turnId&&
    m.role==='assistant').length,1);
});
test('lost ACK after R07M receipt checkpoint and after reply are recoverable',async()=>{
  for(const stage of ['checkpoint','reply']){
    const h=setup(),created=await h.create();
    const original=h.journal.append.bind(h.journal);
    let failed=false;
    h.journal.append=async request=>{
      const out=await original(request);
      if(!failed&&(
        stage==='checkpoint'&&request.body.kind==='checkpoint'&&
          request.body.stage==='r07r_unsaved_review_edit_receipt_v1'||
        stage==='reply'&&request.body.kind==='message'&&
          request.body.role==='assistant'&&
          request.body.text.startsWith('تم إثبات تعديل')
      )){
        failed=true;throw Error('NETWORK_LOST_AFTER_R07M_'+stage);
      }
      return out;
    };
    await assert.rejects(unified(h).acceptOfflineUnifiedReviewEdit(
      TOKEN,auditInput(created)),/NETWORK_LOST_AFTER_R07M_/);
    assert.equal(failed,true);
    const other=setup(h.db);
    const out=await unified(other).acceptOfflineUnifiedReviewEdit(
      TOKEN,auditInput(created));
    assert.equal(out.appliedDraftRevision,2);
    assert.equal(out.status,'applied_unsaved_review');
    assert.equal(other.calls(),0);
    assert.equal((await other.draftStore.read(scope,created.turnId)).draftRevision,2);
    const hist=await other.journal.auditFullHistory(scope);
    assert.equal(hist.messages.filter(m=>m.turnId===out.turnId&&
      m.role==='assistant').length,1);
  }
});
test('two processes with the same request commit one edit and final reply',async()=>{
  const h=setup(),created=await h.create(),a=setup(h.db),b=setup(h.db);
  const outcomes=await Promise.allSettled([
    unified(a).acceptOfflineUnifiedReviewEdit(TOKEN,auditInput(created)),
    unified(b).acceptOfflineUnifiedReviewEdit(TOKEN,auditInput(created)),
  ]);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,0,
    JSON.stringify(outcomes.filter(x=>x.status==='rejected')
      .map(x=>String(x.reason))));
  const ids=outcomes.map(x=>x.value.turnId);
  assert.equal(new Set(ids).size,1);
  assert.equal((await h.draftStore.read(scope,created.turnId)).draftRevision,2);
  const hist=await h.journal.auditFullHistory(scope);
  assert.equal(hist.messages.filter(m=>m.turnId===ids[0]&&
    m.role==='assistant').length,1);
});
test('same request cannot change body or draft origin after binding',async()=>{
  const h=setup(),created=await h.create(),c=unified(h);
  await c.acceptOfflineUnifiedReviewEdit(TOKEN,auditInput(created));
  const writes=h.db.writes;
  await assert.rejects(c.acceptOfflineUnifiedReviewEdit(TOKEN,
    auditInput(created,input('غير العميل إلى شركة أخرى'))),
  /R07_TURN_IDEMPOTENCY_COLLISION/);
  await assert.rejects(c.acceptOfflineUnifiedReviewEdit(TOKEN,{
    ...auditInput(created),originTurnId:'different-origin',
  }),/R07M_UNIFIED_REQUEST_COLLISION/);
  assert.equal(h.db.writes,writes);
});
test('old proposal-only turn cannot be silently reclassified as an edit',async()=>{
  const h=setup(),created=await h.create(),planning=auditCoordinator(h);
  await planning.acceptOfflineSemantic(TOKEN,input());
  const writes=h.db.writes;
  await assert.rejects(unified(h).acceptOfflineUnifiedReviewEdit(
    TOKEN,auditInput(created)),
  /R07M_UNIFIED_TASK_TYPE_COLLISION/);
  assert.equal(h.db.writes,writes);
});
test('ambiguous or missing trusted customer becomes verified no-edit clarification',async()=>{
  const h=setup(),created=await h.create();
  const other=setup(h.db,{overrideCandidate:{
    action:'edit_draft',subject:null,reference:'active_draft',
    sourceIds:[],missingFields:[],
    facts:[{name:'customer_name',value:'شركة غير موجودة'}],
  }});
  const result=await unified(other).acceptOfflineUnifiedReviewEdit(
    TOKEN,auditInput(created));
  assert.equal(result.status,'needs_clarification');
  assert.equal(result.appliedDraftRevision,null);
  assert.match(result.reply,/لم أؤكد تنفيذ أي تعديل/);
  assert.equal((await h.draftStore.read(scope,created.turnId)).draftRevision,1);
  assert.equal(receiptKeys(h.db).length,0);
  const again=await unified(setup(h.db)).acceptOfflineUnifiedReviewEdit(
    TOKEN,auditInput(created));
  assert.equal(again.replayed,true);
  assert.equal(again.status,'needs_clarification');
});
test('revoked identity denied even on completed request; foreign branch denied',async()=>{
  const h=setup(),created=await h.create();
  await unified(h).acceptOfflineUnifiedReviewEdit(TOKEN,auditInput(created));
  const invalid=setup(h.db,{revoked:true}),reads=h.db.reads;
  await assert.rejects(unified(invalid).acceptOfflineUnifiedReviewEdit(
    TOKEN,auditInput(created)),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal(h.db.reads,reads);
  await assert.rejects(unified(setup(h.db)).acceptOfflineUnifiedReviewEdit(
    TOKEN,auditInput(created,input(undefined,'same-request',{
      branchId:'foreign-branch',
    }))),/AUTH_MEMBERSHIP_DENIED/);
});
test('stale draft edit reports no change rather than mutating again',async()=>{
  const h=setup(),created=await h.create();
  await unified(h).acceptOfflineUnifiedReviewEdit(TOKEN,auditInput(created));
  const newer=await unified(h).acceptOfflineUnifiedReviewEdit(TOKEN,
    auditInput(created,input('خلي العميل شركة النور','next-request')));
  assert.equal(newer.status,'needs_clarification');
  assert.equal(newer.appliedDraftRevision,null);
  assert.equal((await h.draftStore.read(scope,created.turnId)).draftRevision,2);
});
