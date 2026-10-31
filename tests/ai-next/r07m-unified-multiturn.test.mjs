/**
 * R07M unified review task: full offline conversation acceptance (synthetic).
 * No paid models, production Firebase, finance writes or live customer data.
 */
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
const DATE=new Date('2026-10-31T22:00:00.000Z');
const epoch=Math.floor(DATE.getTime()/1000);
const TOKEN='r07m-unified-multiturn-offline-token';
const scope={
  ownerUid:'owner-multiturn',actorId:'owner-multiturn',
  accountId:'multi-account',companyId:'multi-company',
  branchId:'multi-branch',threadId:'multi-thread',
  role:'owner',scopeType:'business',authorizationVersion:1,
};
const request=(message,key)=>({
  schemaVersion:1,accountId:scope.accountId,companyId:scope.companyId,
  branchId:scope.branchId,threadId:scope.threadId,scopeType:'business',
  requestId:key,idempotencyKey:key,userMessageId:'user-'+key,
  message,mode:'controller',
});
const clone=x=>structuredClone(x);
class DB{
  docs=new Map();writes=0;lock=Promise.resolve();
  collection(name){
    if(![R07M_FAST_COLLECTION,R07D_DRAFT_COLLECTION,
      R07D_EDIT_RECEIPT_COLLECTION].includes(name))
      throw Error('UNEXPECTED_ROOT');
    return {doc:id=>({id:name+':'+id,get:async()=>this.get(name+':'+id)})};
  }
  get(key){
    const found=this.docs.get(key);
    return {exists:found!==undefined,
      data:()=>found===undefined?undefined:clone(found)};
  }
  async runTransaction(fn){
    const previous=this.lock;let release;
    this.lock=previous.then(()=>new Promise(ok=>{release=ok;}));
    await previous;
    try{
      const staged=new Map();
      const tx={
        get:async ref=>this.get(ref.id),
        create:(ref,value)=>{
          if(this.docs.has(ref.id)||staged.has(ref.id))
            throw Error('ALREADY_EXISTS');
          staged.set(ref.id,clone(value));
        },
        set:(ref,value)=>staged.set(ref.id,clone(value)),
      };
      const result=await fn(tx);
      for(const [key,value] of staged){
        this.docs.set(key,value);this.writes++;
      }
      return result;
    }finally{release();}
  }
}
const candidate=message=>{
  let facts=[];
  if(message.includes('العميل')){
    facts=[{name:'customer_name',value:message.includes('مجهولة')?
      'شركة مجهولة':'شركة النور'}];
  }else if(message.includes('العملة')){
    facts=[{name:'currency',value:'USD'}];
  }else if(message.includes('أضف')){
    facts=[{name:'operation',value:'append_line'},
      {name:'description',value:message.includes('الثاني')?
        'Second synthetic item':'First synthetic item'},
      {name:'quantity',value:'10'},{name:'unit',value:'PCS'},
      {name:'selling_unit_price',value:'15'},{name:'currency',value:'USD'}];
  }else if(message.includes('الكمية')){
    facts=[{name:'quantity',value:message.includes('20')?'20':'12'}];
  }
  return {action:'edit_draft',subject:null,reference:'active_draft',
    facts,sourceIds:[],missingFields:[]};
};
function setup(db=new DB(),options={}){
  let interpretations=0;
  const principal={verify:async()=>({
    uid:'owner-multiturn',role:'owner',anonymous:false,
    tokenIssuedAt:epoch-120,tokenExpiresAt:epoch+3600,
    authenticatedAt:epoch-240,
  })};
  const membership={readForActor:async()=>options.revoked?null:{
    ownerUid:'owner-multiturn',actorUid:'owner-multiturn',
    accountId:scope.accountId,companyId:scope.companyId,
    branchId:scope.branchId,active:true,authorizationVersion:1,
    permittedRoles:['owner'],
  }};
  const journal=new R07JExperimentalIndexedJournal(db,true);
  const drafts=new R07DExperimentalFirestoreDraftStore(db);
  const session=createR07RTrustedOfflineReviewSession({
    offlineFixtureMode:true,offlineReceiptMode:true,
    offlineDeterministicStructuredIntents:options.deterministic===true?true:undefined,
    principal,membership,journal,draftStore:drafts,
    customers:{resolveUnique:async(_scope,name)=>
      name==='شركة النور'?'verified-customer-noor':null},
    syntheticInterpreter:{interpret:async turn=>{
      interpretations++;
      return options.candidate??candidate(turn.message);
    }},
    clock:()=>new Date(DATE),
  });
  const coordinator=new R07MFastLocalCoordinator({
    principal,membership,journal,draftStore:drafts,
    offlineReviewBridge:session.bridge,
    offlineReviewReceiptStore:drafts,
    allowOfflineUnifiedReviewEdit:true,
    clock:()=>new Date(DATE),
  });
  const create=(key='initial-quote')=>coordinator.accept(
    TOKEN,request('أنشئ مسودة عرض سعر',key));
  const edit=async(message,key,origin,expected)=>{
    const current=expected??await drafts.read(scope,origin);
    return coordinator.acceptOfflineUnifiedReviewEdit(TOKEN,{
      turn:request(message,key),originTurnId:origin,
      expectedDraftRevision:current.draftRevision,
      expectedDraftHash:current.immutableRevisionHash,
    });
  };
  const history=()=>coordinator.history(TOKEN,{
    schemaVersion:1,accountId:scope.accountId,companyId:scope.companyId,
    branchId:scope.branchId,threadId:scope.threadId,scopeType:'business',
  });
  return {db,drafts,coordinator,journal,session,create,edit,history,
    interpretations:()=>interpretations};
}
test('unified conversation creates customer, line, quantity revisions across reopens',async()=>{
  const h=setup(),created=await h.create(),origin=created.turnId;
  assert.equal(created.draft.draftRevision,1);
  const customer=await h.edit('خلي العميل شركة النور','set-customer',origin);
  assert.equal(customer.appliedDraftRevision,2);
  const currency=await h.edit('خلي العملة USD','set-currency',origin);
  assert.equal(currency.appliedDraftRevision,3);
  const line=await h.edit('أضف 10 قطع بسعر 15 دولار','add-first',origin);
  assert.equal(line.appliedDraftRevision,4);
  const correction=await h.edit('لا خلي الكمية 12','correct-quantity',origin);
  assert.equal(correction.appliedDraftRevision,5);
  assert.equal(correction.financialSaved,false);
  const reloaded=setup(h.db);
  const saved=await reloaded.drafts.read(scope,origin);
  assert.equal(saved.draftRevision,5);
  assert.equal(saved.explicitCustomerId,'verified-customer-noor');
  assert.equal(saved.lineItems.length,1);
  assert.equal(saved.lineItems[0].quantity,'12');
  assert.equal(saved.lineItems[0].sellingUnitPrice,'15');
  assert.equal(saved.status,'needs_review');
  assert.equal(saved.approvalReceiptId,null);
  const history=await reloaded.history();
  assert.equal(history.turns.length,5);
  assert.equal(history.tasks.filter(t=>t.taskType==='unsaved_review_edit').length,4);
  for(const t of history.tasks.filter(t=>t.taskType==='unsaved_review_edit')){
    assert.equal(t.state,'completed');
    assert.equal(history.messages.filter(m=>m.turnId===t.turnId&&
      m.role==='assistant').length,1);
    assert.equal(history.checkpointRefs.filter(c=>c.taskId===t.taskId).length,2);
  }
  assert.equal(reloaded.interpretations(),0);
  const old=await h.journal.auditFullHistory(scope);
  assert.equal(old.messages.filter(m=>m.role==='assistant').length,5);
  assert.equal(reloaded.interpretations(),0);
});
test('two lines require exact item selection; ambiguous correction cannot mutate',async()=>{
  const h=setup(),created=await h.create(),origin=created.turnId;
  await h.edit('العملة USD','set-currency-for-two-lines',origin);
  await h.edit('أضف أول منتج','add-first',origin);
  await h.edit('أضف المنتج الثاني','add-second',origin);
  const before=await h.drafts.read(scope,origin);
  assert.equal(before.lineItems.length,2);
  const uncertain=await h.edit('لا خلي الكمية 20','ambiguous-line',origin);
  assert.equal(uncertain.status,'needs_clarification');
  assert.equal(uncertain.appliedDraftRevision,null);
  assert.equal((await h.drafts.read(scope,origin)).draftRevision,before.draftRevision);
  const audit=await h.history();
  assert.equal(audit.checkpointRefs.filter(c=>c.taskId===uncertain.taskId).length,1);
});
test('two active quotations force clarification, never guess last quotation',async()=>{
  const h=setup();const first=await h.create('first-draft');
  await h.create('second-draft');
  const before=h.db.writes;
  const out=await h.edit('خلي العميل شركة النور','ambiguous-draft',
    first.turnId);
  assert.equal(out.status,'needs_clarification');
  assert.equal(out.appliedDraftRevision,null);
  assert.equal((await h.drafts.read(scope,first.turnId)).draftRevision,1);
  assert.equal((await h.drafts.read(scope,
    (await h.history()).turns[1].turnId)).draftRevision,1);
  assert.ok(h.db.writes>before,'only journal clarification may be written');
});
test('unverified customer cannot become invented verified ID',async()=>{
  const h=setup(),created=await h.create();
  const out=await h.edit('العميل شركة مجهولة','missing-customer',
    created.turnId);
  assert.equal(out.status,'needs_clarification');
  assert.equal(out.appliedDraftRevision,null);
  assert.equal((await h.drafts.read(scope,created.turnId)).explicitCustomerId,
    null);
});
test('revoked membership blocks historical replay before any draft retrieval',async()=>{
  const h=setup(),created=await h.create();
  await h.edit('خلي العميل شركة النور','edit-once',created.turnId);
  const revoked=setup(h.db,{revoked:true}),writes=h.db.writes;
  await assert.rejects(revoked.edit('خلي العميل شركة النور',
    'edit-once',created.turnId,created.draft),/AUTH_MEMBERSHIP_DENIED/);
  assert.equal(h.db.writes,writes);
});

test('real local parsing edits an audited unsaved quotation without synthetic model interpretation',async()=>{
  const h=setup(undefined,{deterministic:true});
  const created=await h.create('local-syntax-origin');
  const origin=created.turnId;
  const customer=await h.edit('خلي العميل شركة النور','local-customer',origin);
  assert.equal(customer.status,'applied_unsaved_review');
  assert.equal(customer.providerCalls,0);
  const currency=await h.edit('خلي العملة USD','local-currency',origin);
  assert.equal(currency.appliedDraftRevision,3);
  // Item addition remains delegated to the existing disabled synthetic
  // fixture. The new parser does not invent description or line identity.
  await h.edit('أضف أول منتج','fixture-line-setup',origin);
  const before=h.interpretations();
  const previousRevision=await h.drafts.read(scope,origin);
  const correction=await h.edit('لا خلي الكمية ١٢','local-quantity',origin);
  assert.equal(correction.status,'applied_unsaved_review');
  assert.equal(correction.providerCalls,0);
  assert.equal(h.interpretations(),before,
    'the zero-cost local edit did not ask a fixture/model');
  const draft=await h.drafts.read(scope,origin);
  assert.equal(draft.draftRevision,5);
  assert.equal(draft.explicitCustomerId,'verified-customer-noor');
  assert.equal(draft.currency,'USD');
  assert.equal(draft.lineItems[0].quantity,'12');
  assert.equal(draft.status,'needs_review');
  assert.equal(draft.approvalReceiptId,null);
  const replay=await h.edit('لا خلي الكمية ١٢','local-quantity',origin,
    previousRevision);
  assert.equal(replay.replayed,true);
  assert.equal(replay.appliedDraftRevision,5);
  assert.equal((await h.drafts.read(scope,origin)).draftRevision,5);
});

test('local deterministic text with two lines requires clarification, never edits',async()=>{
  const h=setup(undefined,{deterministic:true});
  const created=await h.create('local-ambiguity-origin');
  const origin=created.turnId;
  await h.edit('خلي العملة USD','local-ambiguity-currency',origin);
  await h.edit('أضف أول منتج','local-ambiguity-first',origin);
  await h.edit('أضف المنتج الثاني','local-ambiguity-second',origin);
  const prior=await h.drafts.read(scope,origin),calls=h.interpretations();
  const result=await h.edit('لا خلي الكمية ١٢','local-ambiguous-quantity',origin);
  assert.equal(result.status,'needs_clarification');
  assert.equal(result.providerCalls,0);
  assert.equal(h.interpretations(),calls);
  assert.equal(result.appliedDraftRevision,null);
  assert.equal((await h.drafts.read(scope,origin)).draftRevision,
    prior.draftRevision);
});

test('one Arabic multi-field request commits ONE revision/receipt and survives reopen/replay',async()=>{
  const h=setup(undefined,{deterministic:true});
  const created=await h.create('paired-origin'),origin=created.turnId;
  await h.edit('خلي العملة USD','paired-currency',origin);
  await h.edit('أضف أول منتج','paired-line-setup',origin);
  const before=await h.drafts.read(scope,origin);
  assert.equal(before.draftRevision,3);
  assert.equal(before.lineItems[0].quantity,'10');
  assert.equal(before.lineItems[0].sellingUnitPrice,'15');
  const synthetics=h.interpretations();
  const result=await h.edit('خلي الكمية ١٢ والسعر ١٧','paired-edit',origin,before);
  assert.equal(result.status,'applied_unsaved_review');
  assert.equal(result.appliedDraftRevision,4);
  assert.equal(result.providerCalls,0);
  assert.equal(result.financialSaved,false);
  assert.equal(h.interpretations(),synthetics,
    'local multi-field command must not invoke semantic provider/fixture');
  const persisted=await h.drafts.read(scope,origin);
  assert.equal(persisted.draftRevision,before.draftRevision+1,
    'quantity and price MUST be one atomic revision, not two writes');
  assert.equal(persisted.lineItems[0].quantity,'12');
  assert.equal(persisted.lineItems[0].sellingUnitPrice,'17');
  assert.equal(persisted.status,'needs_review');
  assert.equal(persisted.approvalReceiptId,null);
  const restored=setup(h.db,{deterministic:true});
  const reopened=await restored.drafts.read(scope,origin);
  assert.equal(reopened.draftRevision,4);
  assert.equal(reopened.immutableRevisionHash,persisted.immutableRevisionHash);
  assert.equal(reopened.lineItems[0].quantity,'12');
  assert.equal(reopened.lineItems[0].sellingUnitPrice,'17');
  const replay=await restored.edit('خلي الكمية ١٢ والسعر ١٧',
    'paired-edit',origin,before);
  assert.equal(replay.replayed,true);
  assert.equal(replay.appliedDraftRevision,4);
  assert.equal(restored.interpretations(),0);
  const after=await restored.drafts.read(scope,origin);
  assert.equal(after.draftRevision,4);
  const history=await restored.history();
  const pairTask=history.tasks.find(x=>x.taskId===result.taskId);
  assert.equal(pairTask?.state,'completed');
  assert.equal(history.messages.filter(m=>m.turnId===result.turnId&&
    m.role==='assistant').length,1);
  assert.equal(history.checkpointRefs.filter(c=>c.taskId===result.taskId).length,2);
  await assert.rejects(restored.edit('خلي الكمية ١٣ والسعر ١٧',
    'paired-edit',origin,before),/R07_TURN_IDEMPOTENCY_COLLISION/);
  assert.equal((await restored.drafts.read(scope,origin)).draftRevision,4);
});

test('paired quantity/price request with two lines never chooses one or changes either',async()=>{
  const h=setup(undefined,{deterministic:true});
  const created=await h.create('paired-ambiguous-origin'),origin=created.turnId;
  await h.edit('خلي العملة USD','paired-ambiguous-currency',origin);
  await h.edit('أضف أول منتج','paired-ambiguous-first',origin);
  await h.edit('أضف المنتج الثاني','paired-ambiguous-second',origin);
  const before=await h.drafts.read(scope,origin),synthetics=h.interpretations();
  const result=await h.edit('Set quantity to 12 and unit price to 17',
    'paired-ambiguous-edit',origin,before);
  assert.equal(result.status,'needs_clarification');
  assert.equal(result.providerCalls,0);
  assert.equal(result.appliedDraftRevision,null);
  assert.equal(h.interpretations(),synthetics);
  const after=await h.drafts.read(scope,origin);
  assert.equal(after.draftRevision,before.draftRevision);
  assert.deepEqual(after.lineItems,before.lineItems);
});

test('compound edit plus financial issue or independent customer target is denied before fixture',async()=>{
  const h=setup(undefined,{deterministic:true});
  const created=await h.create('paired-unsafe-origin'),origin=created.turnId;
  await h.edit('خلي العملة USD','paired-unsafe-currency',origin);
  await h.edit('أضف أول منتج','paired-unsafe-line',origin);
  const before=await h.drafts.read(scope,origin),synthetics=h.interpretations();
  for(const [message,key] of [
    ['خلي الكمية 12 والسعر 17 واحفظ','paired-unsafe-approve'],
    ['خلي العميل شركة النور والسعر 17','paired-unsafe-customer'],
    ['Set quantity to 12 and unit price to 17 and then issue the invoice',
      'paired-unsafe-issue'],
  ]){
    const result=await h.edit(message,key,origin,before);
    assert.equal(result.status,'needs_clarification',message);
    assert.equal(result.appliedDraftRevision,null,message);
    assert.equal(result.providerCalls,0);
    assert.equal(h.interpretations(),synthetics);
    const current=await h.drafts.read(scope,origin);
    assert.equal(current.draftRevision,before.draftRevision);
    assert.deepEqual(current.lineItems,before.lineItems);
  }
});

test('price clarification resumes only on next audited user turn and seals one R07D revision',async()=>{
  const h=setup(undefined,{deterministic:true});
  const created=await h.create('price-followup-origin'),origin=created.turnId;
  await h.edit('خلي العملة USD','price-followup-currency',origin);
  await h.edit('أضف أول منتج','price-followup-item',origin);
  const before=await h.drafts.read(scope,origin);
  assert.equal(before.lineItems.length,1);
  assert.equal(before.lineItems[0].sellingUnitPrice,'15');
  const initial=await h.edit('عدل السعر','price-followup-question',origin,before);
  assert.equal(initial.status,'needs_clarification');
  assert.equal(initial.appliedDraftRevision,null);
  assert.equal(initial.financialSaved,false);
  assert.equal((await h.drafts.read(scope,origin)).draftRevision,before.draftRevision);
  const priorSynthetic=h.interpretations();
  const restarted=setup(h.db,{deterministic:true});
  const result=await restarted.edit('١٧','price-followup-answer',origin,before);
  assert.equal(result.status,'applied_unsaved_review');
  assert.equal(result.providerCalls,0);
  assert.equal(result.financialSaved,false);
  assert.equal(result.appliedDraftRevision,before.draftRevision+1);
  assert.equal(restarted.interpretations(),0,
    'the resumed follow-up must not request an AI/model answer');
  const persisted=await restarted.drafts.read(scope,origin);
  assert.equal(persisted.lineItems[0].sellingUnitPrice,'17');
  assert.equal(persisted.lineItems[0].quantity,'10');
  assert.equal(persisted.status,'needs_review');
  assert.equal(persisted.approvalReceiptId,null);
  const again=setup(h.db,{deterministic:true});
  const replay=await again.edit('١٧','price-followup-answer',origin,before);
  assert.equal(replay.replayed,true);
  assert.equal(replay.appliedDraftRevision,before.draftRevision+1);
  assert.equal(again.interpretations(),0);
  assert.equal((await again.drafts.read(scope,origin)).draftRevision,
    before.draftRevision+1);
  const history=await again.history();
  assert.equal(history.turns.length,5);
  const replies=history.messages.filter(x=>
    x.turnId===result.turnId&&x.role==='assistant');
  assert.equal(replies.length,1);
  assert.equal(history.checkpointRefs.filter(c=>
    c.taskId===result.taskId).length,2);
  assert.equal(priorSynthetic>=0,true);
});

test('standalone number cannot edit without immediately preceding verified clarification',async()=>{
  const h=setup(undefined,{deterministic:true});
  const created=await h.create('orphan-price-origin'),origin=created.turnId;
  await h.edit('خلي العملة USD','orphan-price-currency',origin);
  await h.edit('أضف أول منتج','orphan-price-line',origin);
  const before=await h.drafts.read(scope,origin),calls=h.interpretations();
  const orphan=await h.edit('١٧','orphan-price-17',origin,before);
  assert.equal(orphan.status,'needs_clarification');
  assert.equal(orphan.appliedDraftRevision,null);
  assert.equal(h.interpretations(),calls);
  assert.equal((await h.drafts.read(scope,origin)).draftRevision,
    before.draftRevision);
  const p=await h.edit('عدل السعر','orphan-price-prompt',origin,before);
  assert.equal(p.status,'needs_clarification');
  const intervening=await h.edit('خلي الكمية ١٢','orphan-intervening-change',
    origin,before);
  assert.equal(intervening.status,'applied_unsaved_review');
  const afterIntervening=await h.drafts.read(scope,origin);
  const later=await h.edit('١٨','orphan-later-18',origin,afterIntervening);
  assert.equal(later.status,'needs_clarification');
  assert.equal(later.appliedDraftRevision,null);
  assert.equal((await h.drafts.read(scope,origin)).lineItems[0].sellingUnitPrice,
    '15');
});

test('two-line price clarification stays unresolved, no guessed line or price update',async()=>{
  const h=setup(undefined,{deterministic:true});
  const created=await h.create('ambiguous-price-followup'),origin=created.turnId;
  await h.edit('خلي العملة USD','ambiguous-price-currency',origin);
  await h.edit('أضف أول منتج','ambiguous-price-first',origin);
  await h.edit('أضف المنتج الثاني','ambiguous-price-second',origin);
  const before=await h.drafts.read(scope,origin);
  assert.equal(before.lineItems.length,2);
  assert.equal((await h.edit('عدل السعر','ambiguous-price-request',
    origin,before)).status,'needs_clarification');
  const calls=h.interpretations();
  const reply=await h.edit('١٧','ambiguous-price-reply',origin,before);
  assert.equal(reply.status,'needs_clarification');
  assert.equal(reply.appliedDraftRevision,null);
  assert.equal(h.interpretations(),calls);
  const current=await h.drafts.read(scope,origin);
  assert.equal(current.draftRevision,before.draftRevision);
  assert.deepEqual(current.lineItems,before.lineItems);
});
