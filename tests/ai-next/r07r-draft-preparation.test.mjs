import test from 'node:test';
import assert from 'node:assert/strict';
import {
  R07RReviewDraftPreparationBridge,R07R_REVIEW_PREPARATION_ACTIVATED,
} from '../../dist/src/ai-next/coordinator/r07r-draft-preparation.js';
import {R07PSemanticPlanner} from '../../dist/src/ai-next/router/semantic-planner.js';
import {R07DExperimentalFirestoreDraftStore,R07D_DRAFT_COLLECTION}
  from '../../dist/src/ai-next/storage/firestore-review-drafts.js';
import {newReviewDraft,SyntheticDraftEditor}
  from '../../dist/src/ai-next/guarded-finance/drafts.js';
import {exactScopeKey}from '../../dist/src/ai-next/domain/turn-journal.js';

const NOW=new Date('2026-10-31T15:00:00.000Z');
const epoch=Math.floor(NOW.getTime()/1000);
const TOKEN='synthetic-r07r-test-bearer-token-with-sufficient-length';
const identity=(role='owner')=>({
  ownerUid:'r07r-owner',actorId:'r07r-owner',role,
  accountId:'r07r-account',companyId:'r07r-company',
  branchId:'r07r-branch',threadId:'r07r-thread',
  scopeType:'business',authorizationVersion:1,
});
const turn=(message='لا خلي الكمية 12',changes={})=>({
  schemaVersion:1,accountId:'r07r-account',companyId:'r07r-company',
  branchId:'r07r-branch',threadId:'r07r-thread',scopeType:'business',
  requestId:'r07r-request',idempotencyKey:'r07r-key',
  userMessageId:'r07r-message',message,mode:'controller',...changes,
});
const candidate=(facts,changes={})=>({
  action:'edit_draft',subject:null,reference:'active_draft',
  facts:Object.entries(facts).map(([name,value])=>({name,value})),
  sourceIds:[],missingFields:[],...changes,
});
class FakeFirestore{
  docs=new Map();lock=Promise.resolve();writes=0;
  collection(name){
    if(name!==R07D_DRAFT_COLLECTION)throw Error('FORBIDDEN_COLLECTION');
    return {doc:id=>({id:name+':'+id,
      get:async()=>this.snapshot(name+':'+id)})};
  }
  snapshot(id){
    const d=this.docs.get(id);
    return {exists:d!==undefined,data:()=>d===undefined?undefined:structuredClone(d)};
  }
  async runTransaction(fn){
    const prev=this.lock;let unlock;
    const pending=new Promise(r=>{unlock=r;});
    this.lock=prev.then(()=>pending);await prev;
    try{
      const changes=new Map();
      const tx={
        get:async ref=>this.snapshot(ref.id),
        create:(ref,d)=>{
          if(this.docs.has(ref.id)||changes.has(ref.id))throw Error('EXISTS');
          changes.set(ref.id,structuredClone(d));
        },
        set:(ref,d)=>changes.set(ref.id,structuredClone(d)),
      };
      const outcome=await fn(tx);
      for(const [id,d] of changes){this.docs.set(id,d);this.writes++;}
      return outcome;
    }finally{unlock();}
  }
}
const seeded=async(db=new FakeFirestore(),opts={})=>{
  const role=opts.role??'owner',scope=identity(role);
  const draftStore=new R07DExperimentalFirestoreDraftStore(db);
  const base=await newReviewDraft({
    scope,draftId:'draft-origin',kind:'quotation',
    sourceIds:[],sourceManifestHash:'0'.repeat(64),
    lineItems:opts.lineItems??[{
      lineId:'line-1',description:'verified synthetic product',
      quantity:'10',unit:'PCS',sellingUnitPrice:'15',currency:'USD',
      evidenceRefs:[],
    }],
    customerId:null,currency:'USD',now:NOW.toISOString(),
  });
  await draftStore.createIfAbsent(scope,'origin',base);
  const principal={verify:async()=>({
    uid:'r07r-owner',role,tokenIssuedAt:epoch-100,
    tokenExpiresAt:epoch+3600,authenticatedAt:epoch-200,
    anonymous:false,
  })};
  const membership={readForActor:async()=>opts.revoked?null:{
    ownerUid:'r07r-owner',actorUid:'r07r-owner',
    accountId:'r07r-account',companyId:'r07r-company',
    branchId:'r07r-branch',active:true,authorizationVersion:1,
    permittedRoles:[role],
  }};
  const counts={synthetic:0,customers:0};
  const c={
    scopeKey:exactScopeKey(scope),historyComplete:opts.historyComplete??true,
    activeDraft:{id:'draft-origin',kind:'quotation',revision:base.draftRevision,
      lineIds:base.lineItems.map(x=>x.lineId)},
    references:[],
  };
  const planner=new R07PSemanticPlanner({
    principal,membership,clock:()=>new Date(NOW),
    context:{load:async()=>opts.context??c},
    syntheticInterpreter:{interpret:async()=>{counts.synthetic++;
      return opts.candidate??candidate({quantity:'12'});
    }},
    allowSyntheticInference:true,
  });
  const customers={
    resolveUnique:async(_scope,name)=>{counts.customers++;
      return name==='شركة النور'?'customer-noor':null;},
  };
  const bridge=new R07RReviewDraftPreparationBridge({
    planner,principal,membership,draftStore,customers,
    clock:()=>new Date(NOW),
  });
  const apply=(message='لا خلي الكمية 12',d=base,changes={})=>
    bridge.prepare(TOKEN,{
      turn:turn(message,changes),expectedDraftRevision:d.draftRevision,
      expectedDraftHash:d.immutableRevisionHash,
    });
  return {db,scope,bridge,base,draftStore,counts,apply,planner,c};
};
test('R07R remains disabled and edits review draft only',async()=>{
  assert.equal(R07R_REVIEW_PREPARATION_ACTIVATED,false);
  const h=await seeded();
  const result=await h.apply();
  assert.equal(result.state,'unsaved_review_revision');
  assert.equal(result.draft.draftRevision,2);
  assert.equal(result.draft.lineItems[0].quantity,'12');
  assert.equal(result.draft.lineItems[0].sellingUnitPrice,'15');
  assert.equal(result.draft.kind,'quotation');
  assert.equal(result.draft.status,'needs_review');
  assert.equal(result.draft.approvalReceiptId,null);
  assert.equal(result.financialSaved,false);
  assert.equal(result.reviewRequired,true);
  assert.equal(result.liveProviderCalls,0);
  assert.equal((await h.draftStore.read(h.scope,'origin')).draftRevision,2);
  assert.equal(h.db.writes,2);
  assert.equal(h.counts.synthetic,1);
});
test('a later persisted revision is opened using verified R04 editor and CAS',async()=>{
  const h=await seeded();
  const first=await h.apply();
  // Directly reopen the persisted R04 review state, NOT old local undo state.
  const reopened=await SyntheticDraftEditor.resume(first.draft);
  assert.equal(reopened.view().draftRevision,2);
  await assert.rejects(reopened.undo(2,NOW.toISOString()),/NO_UNDO/);
  const second=await reopened.edit({
    expectedRevision:2,change:{kind:'line_patch',lineId:'line-1',
      patch:{quantity:'14'}},now:NOW.toISOString(),
  });
  const actual=await h.draftStore.replaceReviewRevision({
    scope:h.scope,turnId:'origin',expectedRevision:2,
    expectedHash:first.draft.immutableRevisionHash,next:second,
  });
  assert.equal(actual.draftRevision,3);
  assert.equal(actual.lineItems[0].quantity,'14');
});
test('explicit customer name must uniquely resolve to existing server-trusted ID',async()=>{
  const h=await seeded(undefined,{candidate:candidate({customer_name:'شركة النور'})});
  const x=await h.apply('خلي العميل شركة النور');
  assert.equal(x.draft.explicitCustomerId,'customer-noor');
  assert.equal(x.draft.fieldStatus.some(x=>x.field==='customer'&&x.status==='uncertain'),true);
  assert.equal(h.counts.customers,1);
});
test('unknown customer is rejected without altering stored draft',async()=>{
  const h=await seeded(undefined,{candidate:candidate({customer_name:'شركة أخرى'})});
  await assert.rejects(h.apply('العميل شركة أخرى'),/R07R_CUSTOMER_NOT_UNIQUELY_VERIFIED/);
  assert.equal(h.db.writes,1);
});
test('one review edit can patch quantity, price and unit atomically',async()=>{
  const h=await seeded(undefined,{candidate:candidate({
    quantity:'12',selling_unit_price:'20.50',unit:'BOX',
  })});
  const edited=await h.apply('عدل الكمية 12 والسعر 20.50 والوحدة كرتون');
  assert.equal(edited.draft.draftRevision,2);
  assert.deepEqual([
    edited.draft.lineItems[0].quantity,
    edited.draft.lineItems[0].sellingUnitPrice,
    edited.draft.lineItems[0].unit,
  ],['12','20.50','BOX']);
});
test('line appended from full user-supplied fields; no product or pricing is fabricated',async()=>{
  const h=await seeded(undefined,{candidate:candidate({
    operation:'append_line',description:'test bottle',
    quantity:'10',unit:'PCS',selling_unit_price:'15',currency:'USD',
  })});
  const x=await h.apply('أضف 10 قطع test bottle بسعر 15 USD');
  assert.equal(x.draft.lineItems.length,2);
  assert.equal(x.draft.lineItems[1].description,'test bottle');
  assert.equal(x.draft.lineItems[1].quantity,'10');
  assert.equal(x.draft.lineItems[1].evidenceRefs.length,0);
  assert.match(x.draft.lineItems[1].lineId,/^line-r07r-/);
  assert.equal(x.draft.businessValidation.valid,false);
});
test('incomplete new line data is rejected rather than auto-filled',async()=>{
  const h=await seeded(undefined,{candidate:candidate({
    operation:'append_line',quantity:'10',selling_unit_price:'15',
  })});
  await assert.rejects(h.apply('أضف عشر قطع'),/R07R_INCOMPLETE_LINE_DATA/);
  assert.equal(h.db.writes,1);
});
test('removal requires verified line and remains reversible only with authorized history',async()=>{
  const h=await seeded(undefined,{candidate:candidate({operation:'remove_line'})});
  const x=await h.apply('احذف هذا الصنف');
  assert.equal(x.draft.lineItems.length,0);
  assert.equal(x.draft.editEvents.at(-1).kind,'remove_line');
});
test('currency cannot be changed with priced lines; conversion is never invented',async()=>{
  const h=await seeded(undefined,{candidate:candidate({currency:'EUR'})});
  await assert.rejects(h.apply('العملة يورو'),/R07R_CURRENCY_REVIEW_REQUIRED/);
  assert.equal(h.db.writes,1);
});
test('valid currency change on an empty draft stays unsaved and unapproved',async()=>{
  const h=await seeded(undefined,{candidate:candidate({currency:'EUR'}),
    lineItems:[]});
  const x=await h.apply('العملة يورو');
  assert.equal(x.draft.currency,'EUR');
  assert.equal(x.draft.status,'needs_review');
  assert.equal(x.financialSaved,false);
});
test('strict revision/hash stops replay of the same change after first receipt',async()=>{
  const h=await seeded();
  const first=await h.apply();
  await assert.rejects(h.apply(),/R07R_STALE_DRAFT/);
  assert.equal(h.db.writes,2);
  assert.equal((await h.draftStore.read(h.scope,'origin')).draftRevision,2);
  assert.equal(first.draft.lineItems[0].quantity,'12');
});
test('parallel same-revision edits converge to one R07D CAS write',async()=>{
  const h=await seeded();
  const results=await Promise.allSettled([h.apply(),h.apply()]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  assert.equal(h.db.writes,2);
  assert.equal((await h.draftStore.read(h.scope,'origin')).draftRevision,2);
});
test('viewer, Advisor and revoked account cannot stage a draft edit',async()=>{
  const viewer=await seeded(undefined,{role:'viewer'});
  await assert.rejects(viewer.apply(),/R07R_PREPARATION_DENIED/);
  assert.equal(viewer.db.writes,1);
  const advisor=await seeded();
  await assert.rejects(advisor.apply('لا خليها 12',advisor.base,{mode:'advisor'}),
    /R07R_PREPARATION_DENIED/);
  assert.equal(advisor.db.writes,1);
  const revoked=await seeded(undefined,{revoked:true});
  await assert.rejects(revoked.apply(),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal(revoked.db.writes,1);
});
test('forged branch is rejected before draft read, no new writes',async()=>{
  const h=await seeded();
  await assert.rejects(h.apply('عدل الكمية',h.base,{branchId:'different-branch'}),
    /AUTH_MEMBERSHIP_DENIED/);
  assert.equal(h.db.writes,1);
});
test('planner unresolved history, foreign references and finance action never write',async()=>{
  for(const options of [
    {historyComplete:false},
    {candidate:candidate({}, {action:'execute_approved'})},
    {candidate:candidate({quantity:'12'},{
      subject:{kind:'draft',id:'draft-foreign'},reference:'none',
    })},
  ]){
    const h=await seeded(undefined,options);
    await assert.rejects(h.apply(),/R07R_UNSAFE_OR_UNRESOLVED_PLAN/);
    assert.equal(h.db.writes,1);
  }
});
test('scope-context forgery fails closed before draft access',async()=>{
  const h=await seeded();
  const foreign={...h.c,scopeKey:'other-tenant'};
  const altered=await seeded(undefined,{context:foreign});
  await assert.rejects(altered.apply(),/R07P_UNTRUSTED_CONTEXT_SCOPE/);
  assert.equal(altered.db.writes,1);
});
test('unexpected combination, extra model fields and invalid decimals do not partially apply',async()=>{
  const scenarios=[
    candidate({customer_name:'شركة النور',quantity:'12'}),
    candidate({quantity:'0'}),
    candidate({selling_unit_price:'-10'}),
    candidate({quantity:'12.1234567'}),
    candidate({quantity:'12',bogus_fact:'surprise'}),
    candidate({line_id:'unknown',quantity:'12'}),
    candidate({operation:'append_line',description:'test',quantity:'10',
      unit:'PCS',selling_unit_price:'15',currency:'EUR'}),
  ];
  for(const scenario of scenarios){
    const h=await seeded(undefined,{candidate:scenario});
    await assert.rejects(h.apply());
    assert.equal(h.db.writes,1);
  }
});
test('ambiguous line mutation with two items is rejected by semantic planner',async()=>{
  const h=await seeded(undefined,{lineItems:[
    {lineId:'line-1',description:'one',quantity:'10',unit:'PCS',
      sellingUnitPrice:'15',currency:'USD',evidenceRefs:[]},
    {lineId:'line-2',description:'two',quantity:'9',unit:'PCS',
      sellingUnitPrice:'14',currency:'USD',evidenceRefs:[]},
  ]});
  await assert.rejects(h.apply(),/R07R_UNSAFE_OR_UNRESOLVED_PLAN/);
  assert.equal(h.db.writes,1);
});
test('untrusted direct action never bypasses R07P intent contract',async()=>{
  const h=await seeded(undefined,{candidate:{...candidate({quantity:'12'}),executed:true}});
  await assert.rejects(h.apply(),/R07P_INVALID_STRUCTURED_CANDIDATE/);
  assert.equal(h.db.writes,1);
});
