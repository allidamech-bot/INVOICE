import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createR07RTrustedOfflineReviewSession,
  R07R_TRUSTED_OFFLINE_REVIEW_SESSION_ACTIVE,
} from '../../dist/src/ai-next/coordinator/r07r-trusted-review-session.js';
import {R07MFastLocalCoordinator}
  from '../../dist/src/ai-next/coordinator/fast-local-coordinator.js';
import {R07JExperimentalIndexedJournal,R07M_FAST_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-indexed-append.js';
import {R07DExperimentalFirestoreDraftStore,R07D_DRAFT_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';

const NOW=new Date('2026-10-31T19:00:00.000Z');
const epoch=Math.floor(NOW.getTime()/1000);
const TOKEN='r07r-test-synthetic-owner-token-long-enough';
const scope={
  ownerUid:'quote-owner',actorId:'quote-owner',accountId:'quote-account',
  companyId:'quote-company',branchId:'quote-branch',
  threadId:'quote-thread',role:'owner',scopeType:'business',
  authorizationVersion:1,
};
const request=(message,requestId='r07r-message',other={})=>({
  schemaVersion:1,accountId:scope.accountId,companyId:scope.companyId,
  branchId:scope.branchId,threadId:scope.threadId,scopeType:'business',
  requestId,idempotencyKey:requestId,userMessageId:requestId+'-user',
  message,mode:'controller',...other,
});
const clone=x=>structuredClone(x);
class ScopedFirestoreMock{
  records=new Map();writes=0;lock=Promise.resolve();
  collection(name){
    if(![R07M_FAST_COLLECTION,R07D_DRAFT_COLLECTION].includes(name))
      throw Error('FORBIDDEN_COLLECTION');
    return {doc:id=>({
      id:name+'/'+id,get:async()=>this.snapshot(name+'/'+id),
    })};
  }
  snapshot(key){
    const v=this.records.get(key);
    return {exists:v!==undefined,data:()=>v===undefined?undefined:clone(v)};
  }
  async runTransaction(work){
    const previous=this.lock;let unlock;
    this.lock=previous.then(()=>new Promise(ok=>{unlock=ok;}));
    await previous;
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
      const out=await work(tx);
      for(const [key,value] of changes){
        this.records.set(key,value);this.writes++;
      }
      return out;
    }finally{unlock();}
  }
}
const candidateFor=message=>{
  let facts;
  if(message.includes('العميل'))facts=[{name:'customer_name',value:'شركة النور'}];
  else if(message.includes('العملة'))facts=[{name:'currency',value:'USD'}];
  else if(message.includes('أضف'))facts=[
    {name:'operation',value:'append_line'},
    {name:'description',value:'Synthetic bottles'},
    {name:'quantity',value:'10'},
    {name:'unit',value:'PCS'},
    {name:'selling_unit_price',value:'15'},
    {name:'currency',value:'USD'},
  ];
  else if(message.includes('الكمية'))facts=[{name:'quantity',value:'12'}];
  else facts=[];
  return {action:'edit_draft',subject:null,reference:'active_draft',
    facts,sourceIds:[],missingFields:[]};
};
function setup(db=new ScopedFirestoreMock(),options={}){
  const principal={verify:async()=>({
    uid:'quote-owner',role:options.role??'owner',anonymous:false,
    tokenIssuedAt:epoch-100,tokenExpiresAt:epoch+3600,authenticatedAt:epoch-200,
  })};
  const membership={readForActor:async()=>options.revoked?null:{
    ownerUid:'quote-owner',actorUid:'quote-owner',
    accountId:scope.accountId,companyId:scope.companyId,
    branchId:scope.branchId,active:true,authorizationVersion:1,
    permittedRoles:[options.role??'owner'],
  }};
  const journal=new R07JExperimentalIndexedJournal(db,true);
  const draftStore=new R07DExperimentalFirestoreDraftStore(db);
  const coordinator=new R07MFastLocalCoordinator({
    journal,draftStore,principal,membership,clock:()=>new Date(NOW),
  });
  let calls=0;
  const session=createR07RTrustedOfflineReviewSession({
    principal,membership,journal,draftStore,
    customers:{resolveUnique:async(_scope,name)=>
      name==='شركة النور'?'known-customer-noor':null},
    syntheticInterpreter:{interpret:async input=>{
      calls++;
      return options.candidate??candidateFor(input.message);
    }},
    clock:()=>new Date(NOW),
  });
  const createQuote=(id='initial-quote')=>coordinator.accept(TOKEN,
    request('أنشئ مسودة عرض سعر',id));
  const attempt=async(message,originTurnId,overrides={})=>{
    const current=await draftStore.read(scope,originTurnId);
    if(!current)throw Error('NO_TEST_DRAFT');
    return session.bridge.prepare(TOKEN,{
      turn:request(message,'followup-'+message,overrides),
      expectedDraftRevision:current.draftRevision,
      expectedDraftHash:current.immutableRevisionHash,
    });
  };
  return {db,journal,draftStore,coordinator,session,createQuote,attempt,
    getCalls:()=>calls};
}
test('trusted offline review bridge remains disabled and never saves financial data',()=>{
  assert.equal(R07R_TRUSTED_OFFLINE_REVIEW_SESSION_ACTIVE,false);
});
test('full synthetic multi-turn quotation lifecycle is R07M creation + R07D CAS edits',async()=>{
  const h=setup();
  const created=await h.createQuote();
  assert.equal(created.draft.draftRevision,1);
  const id=created.turnId;
  const customer=await h.attempt('خلي العميل شركة النور',id);
  assert.equal(customer.draft.draftRevision,2);
  assert.equal(customer.draft.explicitCustomerId,'known-customer-noor');
  const currency=await h.attempt('العملة USD',id);
  assert.equal(currency.draft.draftRevision,3);
  assert.equal(currency.draft.currency,'USD');
  const line=await h.attempt('أضف 10 قطع بسعر 15 دولار',id);
  assert.equal(line.draft.draftRevision,4);
  assert.equal(line.draft.lineItems.length,1);
  assert.equal(line.draft.lineItems[0].description,'Synthetic bottles');
  assert.equal(line.draft.lineItems[0].quantity,'10');
  assert.equal(line.draft.lineItems[0].sellingUnitPrice,'15');
  const correction=await h.attempt('لا خلي الكمية 12',id);
  assert.equal(correction.draft.draftRevision,5);
  assert.equal(correction.draft.lineItems[0].quantity,'12');
  assert.equal(correction.draft.lineItems[0].sellingUnitPrice,'15');
  assert.equal(correction.financialSaved,false);
  assert.equal(correction.reviewRequired,true);
  assert.equal(correction.liveProviderCalls,0);
  assert.equal(correction.draft.kind,'quotation');
  assert.equal(correction.draft.status,'needs_review');
  assert.equal(correction.draft.approvalReceiptId,null);
  const external=setup(h.db);
  const reloaded=await external.draftStore.read(scope,id);
  assert.deepEqual(reloaded,correction.draft);
  const context=await external.session.context.load(scope);
  assert.equal(context.activeDraft.id,correction.draft.draftId);
  assert.equal(context.activeDraft.revision,5);
  assert.deepEqual(context.activeDraft.lineIds,
    correction.draft.lineItems.map(l=>l.lineId));
  assert.equal(h.getCalls(),4);
});
test('repeat of already-applied expected revision cannot double-edit',async()=>{
  const h=setup();const created=await h.createQuote();
  const original=await h.draftStore.read(scope,created.turnId);
  const p={
    turn:request('خلي العميل شركة النور','same-customer-request'),
    expectedDraftRevision:original.draftRevision,
    expectedDraftHash:original.immutableRevisionHash,
  };
  await h.session.bridge.prepare(TOKEN,p);
  const writes=h.db.writes;
  await assert.rejects(h.session.bridge.prepare(TOKEN,p),/R07R_STALE_DRAFT/);
  assert.equal(h.db.writes,writes);
});
test('multiple unsaved quotes force clarification; no guessed active draft',async()=>{
  const h=setup();
  const one=await h.createQuote('first-quote');
  await h.createQuote('second-quote');
  const writes=h.db.writes;
  await assert.rejects(h.attempt('خلي العميل شركة النور',one.turnId),
    /R07R_UNSAFE_OR_UNRESOLVED_PLAN/);
  assert.equal(h.db.writes,writes);
});
test('revoked role or foreign branch blocks synthetic edit before any write',async()=>{
  const h=setup();const created=await h.createQuote();
  const revoked=setup(h.db,{revoked:true});
  const before=h.db.writes;
  await assert.rejects(revoked.attempt('خلي العميل شركة النور',created.turnId),
    /AUTH_MEMBERSHIP_DENIED/);
  const foreign=setup(h.db);
  await assert.rejects(foreign.attempt('خلي العميل شركة النور',created.turnId,
    {branchId:'foreign-branch'}),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal(h.db.writes,before);
});
test('model output demanding execution is not a draft action',async()=>{
  const h=setup();const created=await h.createQuote();
  const hostile=setup(h.db,{candidate:{
    action:'execute_approved',subject:null,reference:'active_draft',
    facts:[],sourceIds:[],missingFields:[],
  }});
  const before=h.db.writes;
  await assert.rejects(hostile.attempt('احفظه',created.turnId),
    /R07R_UNSAFE_OR_UNRESOLVED_PLAN/);
  assert.equal(h.db.writes,before);
});
test('corrupted draft bytes fail R07D integrity; no partial overwrite',async()=>{
  const h=setup();const created=await h.createQuote();
  const key=[...h.db.records.keys()].find(x=>
    x.startsWith(R07D_DRAFT_COLLECTION+'/'));
  assert.ok(key);
  const d=clone(h.db.records.get(key));
  d.draft.lineItems.push({lineId:'forged',description:'forged',quantity:'1000',
    unit:'PCS',sellingUnitPrice:'0',currency:'USD',evidenceRefs:[]});
  h.db.records.set(key,d);
  const before=h.db.writes;
  await assert.rejects(h.attempt('خلي العميل شركة النور',created.turnId),
    /R07D_/);
  assert.equal(h.db.writes,before);
});
