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
  return {db,journal,draftStore,session,coordinator,create,edit,
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
