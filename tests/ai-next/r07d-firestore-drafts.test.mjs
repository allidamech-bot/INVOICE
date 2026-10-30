import test from 'node:test';
import assert from 'node:assert/strict';
import {
  R07DExperimentalFirestoreDraftStore,
  R07D_PRODUCTION_DRAFT_STORAGE_ACTIVATED,
  R07D_DRAFT_COLLECTION,R07D_MAX_DOCUMENT_BYTES,
} from '../../dist/src/ai-next/storage/firestore-review-drafts.js';
import {newReviewDraft,SyntheticDraftEditor}
  from '../../dist/src/ai-next/guarded-finance/drafts.js';
import {R07ExperimentalFirestoreEventBackend}
  from '../../dist/src/ai-next/storage/firestore-event-backend.js';
import {ScopedConversationLedger}
  from '../../dist/src/ai-next/conversation-state/event-store.js';
import {R07LocalCoordinator}
  from '../../dist/src/ai-next/coordinator/local-coordinator.js';

const NOW='2026-10-30T16:20:00.000Z';
const scope={
  ownerUid:'r07d-owner',accountId:'r07d-account',
  companyId:'r07d-company',branchId:'r07d-branch',
  threadId:'r07d-thread',actorId:'r07d-owner',
  role:'owner',scopeType:'business',authorizationVersion:1,
};
const clone=x=>structuredClone(x);
class MultiCollectionFirestoreMock{
  records=new Map();
  chain=Promise.resolve();writes=0;gets=[];
  collection(name){
    if(!['aiNextReviewDraftsV1','aiNextEventThreadsV1'].includes(name))
      throw Error('UNTRUSTED_COLLECTION');
    return {doc:id=>{
      const key=name+'/'+id;
      return {id:key,get:async()=>this.snapshot(key)};
    }};
  }
  snapshot(id){
    this.gets.push(id);
    const found=this.records.get(id);
    return {exists:found!==undefined,data:()=>clone(found)};
  }
  async runTransaction(work){
    const previous=this.chain;
    let release;
    const next=new Promise(resolve=>{release=resolve;});
    this.chain=previous.then(()=>next);
    await previous;
    try{
      const changes=new Map();
      const tx={
        get:async ref=>this.snapshot(ref.id),
        create:(ref,doc)=>{
          if(this.records.has(ref.id)||changes.has(ref.id))
            throw Error('ALREADY_EXISTS');
          changes.set(ref.id,clone(doc));
        },
        set:(ref,doc)=>changes.set(ref.id,clone(doc)),
      };
      const result=await work(tx);
      for(const [id,doc] of changes){
        this.records.set(id,doc);this.writes++;
      }
      return result;
    }finally{release();}
  }
}
const fresh=async(overrides={})=>newReviewDraft({
  scope:{...scope,...overrides},draftId:'draft-turn-1',kind:'quotation',
  sourceIds:[],sourceManifestHash:'0'.repeat(64),lineItems:[],
  customerId:null,currency:null,now:NOW,
});
const store=db=>new R07DExperimentalFirestoreDraftStore(db);
const read=(s)=>s.read(scope,'turn-1');
test('production draft flag is false, collection is not in client-writable /users path',()=>{
  assert.equal(R07D_PRODUCTION_DRAFT_STORAGE_ACTIVATED,false);
  assert.equal(R07D_DRAFT_COLLECTION,'aiNextReviewDraftsV1');
  assert.ok(R07D_MAX_DOCUMENT_BYTES<1_000_000);
});
test('R04 empty unsaved quote is stored and reconstructed through independent store',async()=>{
  const db=new MultiCollectionFirestoreMock(),a=store(db),b=store(db);
  const draft=await fresh();
  const committed=await a.createIfAbsent(scope,'turn-1',draft);
  const restored=await read(b);
  assert.deepEqual(committed,draft);
  assert.deepEqual(restored,draft);
  assert.equal(db.writes,1);
  assert.equal(db.records.size,1);
});
test('repeat of exact draft is idempotent without second write',async()=>{
  const db=new MultiCollectionFirestoreMock(),a=store(db);
  const d=await fresh();
  await a.createIfAbsent(scope,'turn-1',d);
  const repeated=await store(db).createIfAbsent(scope,'turn-1',d);
  assert.equal(repeated.immutableRevisionHash,d.immutableRevisionHash);
  assert.equal(db.writes,1);
});
test('two independently created store instances serialize concurrent create',async()=>{
  const db=new MultiCollectionFirestoreMock(),d=await fresh();
  const out=await Promise.all([
    store(db).createIfAbsent(scope,'turn-1',d),
    store(db).createIfAbsent(scope,'turn-1',d),
  ]);
  assert.equal(out.length,2);
  assert.equal(out[0].draftId,out[1].draftId);
  assert.equal(db.writes,1);
});
test('same turn with different content is rejected rather than overwriting',async()=>{
  const db=new MultiCollectionFirestoreMock(),d=await fresh();
  await store(db).createIfAbsent(scope,'turn-1',d);
  const alternate=await newReviewDraft({
    scope,draftId:'draft-turn-1',kind:'quotation',
    sourceIds:[],sourceManifestHash:'0'.repeat(64),lineItems:[],
    customerId:'customer-new',currency:'USD',now:NOW,
  });
  await assert.rejects(store(db).createIfAbsent(scope,'turn-1',alternate),
    /R07D_CREATE_IDEMPOTENCY_COLLISION/);
  assert.equal(db.writes,1);
});
test('exact scope isolation prevents reading foreign company/branch/actor/epoch',async()=>{
  const db=new MultiCollectionFirestoreMock(),a=store(db),draft=await fresh();
  await a.createIfAbsent(scope,'turn-1',draft);
  for(const override of [
    {ownerUid:'r07d-other'},{actorId:'r07d-other'},
    {companyId:'r07d-other'},{branchId:'r07d-other'},
    {accountId:'r07d-other'},{authorizationVersion:2},
    {threadId:'r07d-other'},
  ]){
    const result=await a.read({...scope,...override},'turn-1');
    assert.equal(result,null);
    await assert.rejects(a.createIfAbsent({...scope,...override},'turn-1',draft),
      /R07D_UNAUTHORIZED_DRAFT/);
  }
  assert.equal(db.writes,1);
});
test('forged R04 revision hash, approval or financial status cannot create draft',async()=>{
  const db=new MultiCollectionFirestoreMock(),d=await fresh();
  for(const changed of [
    {...d,immutableRevisionHash:'a'.repeat(64)},
    {...d,approvalReceiptId:'fake-approval'},
    {...d,status:'saved'},
    {...d,kind:'invoice_proposal'},
    {...d,draftId:'draft-other'},
    {...d,draftRevision:3},
    {...d,lineItems:[{lineId:'bad',description:'Product',quantity:'3',unit:'PCS',
      sellingUnitPrice:'5',currency:'USD',evidenceRefs:[]}]},
  ]){
    await assert.rejects(store(db).createIfAbsent(scope,'turn-1',changed),
      /R07D_(UNAUTHORIZED_DRAFT|REVISION_HASH_MISMATCH|INVALID_DRAFT_CONTRACT)/);
  }
  assert.equal(db.records.size,0);
});
test('tampered stored content is rejected on read and replay',async()=>{
  const db=new MultiCollectionFirestoreMock(),a=store(db);
  await a.createIfAbsent(scope,'turn-1',await fresh());
  const [key,record]=[...db.records.entries()][0];
  db.records.set(key,{...record,draft:{...record.draft,explicitCustomerId:'tampered'}});
  await assert.rejects(read(a),
    /R07D_(REVISION_HASH_MISMATCH|STORED_INTEGRITY_MISMATCH)/);
  await assert.rejects(a.createIfAbsent(scope,'turn-1',await fresh()),
    /R07D_(REVISION_HASH_MISMATCH|STORED_INTEGRITY_MISMATCH)/);
});
test('stored metadata tamper, extra keys or oversized record always fail closed',async()=>{
  const examples=[
    x=>({...x,scopeKey:'foreign'}),
    x=>({...x,contentHash:'0'.repeat(64)}),
    x=>({...x,roguePermission:true}),
    x=>({...x,draftRevision:2}),
    x=>({...x,draft:{...x.draft,createdAt:'wrong'}}),
    x=>({...x,draft:{...x.draft,
      editEvents:Array.from({length:18000},(_,i)=>({revision:i+1,kind:'tamper',lineId:null}))}}),
  ];
  for(const corrupt of examples){
    const db=new MultiCollectionFirestoreMock(),a=store(db);
    await a.createIfAbsent(scope,'turn-1',await fresh());
    const [key,old]=[...db.records.entries()][0];
    db.records.set(key,corrupt(old));
    await assert.rejects(read(a),/R07D_/);
  }
});
test('R04 edit revision is persisted by CAS without financial saving',async()=>{
  const db=new MultiCollectionFirestoreMock(),a=store(db);
  const initial=await fresh();
  await a.createIfAbsent(scope,'turn-1',initial);
  const editor=await SyntheticDraftEditor.create(initial);
  const next=await editor.edit({
    expectedRevision:1,
    change:{kind:'append_line',line:{
      lineId:'line-1',description:'One item',quantity:'2',
      unit:'PCS',sellingUnitPrice:'15.00',currency:'USD',evidenceRefs:[],
    }},
    now:'2026-10-30T16:20:01.000Z',
  });
  const saved=await a.replaceReviewRevision({
    scope,turnId:'turn-1',expectedRevision:1,
    expectedHash:initial.immutableRevisionHash,next,
  });
  assert.equal(saved.draftRevision,2);
  assert.equal(saved.status,'needs_review');
  assert.equal(saved.approvalReceiptId,null);
  assert.equal(saved.lineItems[0].sellingUnitPrice,'15.00');
  assert.deepEqual(await read(store(db)),next);
  assert.equal(db.writes,2);
});
test('R04 edit CAS rejects concurrent stale updates with no lost revision',async()=>{
  const db=new MultiCollectionFirestoreMock(),a=store(db),b=store(db);
  const initial=await fresh();
  await a.createIfAbsent(scope,'turn-1',initial);
  const ea=await SyntheticDraftEditor.create(initial);
  const eb=await SyntheticDraftEditor.create(initial);
  const make=editor=>editor.edit({
    expectedRevision:1,change:{kind:'set_customer',customerId:'synthetic-customer'},
    now:'2026-10-30T16:20:05.000Z',
  });
  const [nextA,nextB]=await Promise.all([make(ea),make(eb)]);
  const outcomes=await Promise.allSettled([
    a.replaceReviewRevision({scope,turnId:'turn-1',expectedRevision:1,
      expectedHash:initial.immutableRevisionHash,next:nextA}),
    b.replaceReviewRevision({scope,turnId:'turn-1',expectedRevision:1,
      expectedHash:initial.immutableRevisionHash,next:nextB}),
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
  assert.equal(db.writes,2);
});
test('CAS rejects attempts to swap source manifests, bypass revision, or insert approval',async()=>{
  const db=new MultiCollectionFirestoreMock(),s=store(db),original=await fresh();
  await s.createIfAbsent(scope,'turn-1',original);
  const editor=await SyntheticDraftEditor.create(original);
  const edited=await editor.edit({expectedRevision:1,
    change:{kind:'set_customer',customerId:'synthetic-client'},
    now:'2026-10-30T16:20:06.000Z'});
  for(const input of [
    {...edited,sourceManifestHash:'1'.repeat(64)},
    {...edited,approvalReceiptId:'fake'},
    {...edited,createdAt:'2025-01-01T00:00:00.000Z'},
    {...edited,undoBaseRevision:0},
  ]){
    await assert.rejects(s.replaceReviewRevision({
      scope,turnId:'turn-1',expectedRevision:1,
      expectedHash:original.immutableRevisionHash,next:input,
    }),/R07D_/);
  }
  assert.equal(db.writes,1);
});
test('same injected Firestore mock supports R03 ledger + R04 draft across coordinators',async()=>{
  const db=new MultiCollectionFirestoreMock();
  const config={
    ledger:new ScopedConversationLedger(new R07ExperimentalFirestoreEventBackend(db)),
    draftStore:store(db),
    principal:{verify:async()=>({
      uid:'r07d-owner',role:'owner',
      tokenIssuedAt:1783000000,tokenExpiresAt:1790000000,
      authenticatedAt:1783000000,anonymous:false,
    })},
    membership:{readForActor:async()=>({
      ownerUid:'r07d-owner',actorUid:'r07d-owner',
      accountId:'r07d-account',companyId:'r07d-company',
      branchId:'r07d-branch',active:true,authorizationVersion:1,
      permittedRoles:['owner'],
    })},
    clock:()=>new Date(NOW),
  };
  const input={
    schemaVersion:1,accountId:'r07d-account',companyId:'r07d-company',
    branchId:'r07d-branch',threadId:'r07d-thread',scopeType:'business',
    requestId:'request-1',idempotencyKey:'key-1',userMessageId:'user-1',
    mode:'controller',message:'أنشئ مسودة عرض سعر',
  };
  const first=await new R07LocalCoordinator(config).accept(
    'synthetic-token-for-test-only-never-authenticated',input);
  assert.equal(first.draft.kind,'quotation');
  assert.equal(first.financialSaved,false);
  assert.equal(first.providerCalls,0);
  const second=new R07LocalCoordinator({
    ...config,
    ledger:new ScopedConversationLedger(new R07ExperimentalFirestoreEventBackend(db)),
    draftStore:store(db),
  });
  const replay=await second.accept('synthetic-token-for-test-only-never-authenticated',input);
  assert.equal(replay.replayed,true);
  assert.equal(replay.turnId,first.turnId);
  assert.equal(replay.draft.immutableRevisionHash,first.draft.immutableRevisionHash);
  assert.equal(db.records.size,2);
  assert.equal(db.writes,6); // one draft, one turn, four downstream R03 events
});
