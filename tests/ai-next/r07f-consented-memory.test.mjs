import test from 'node:test';
import assert from 'node:assert/strict';
import {ScopedKnowledgeService,knowledgeScopeKey}
  from '../../dist/src/ai-next/conversation-state/knowledge.js';
import {
  R07FExperimentalFirestoreKnowledgeBackend,
  R07F_PRODUCTION_MEMORY_STORAGE_ACTIVATED,
  R07F_MEMORY_COLLECTION,R07F_MAX_MEMORY_BYTES,
} from '../../dist/src/ai-next/storage/firestore-knowledge-cas.js';

const createdAt='2026-10-30T16:50:00.000Z';
const expiredAt='2026-11-29T16:50:00.000Z';
const scope={
  ownerUid:'memory-owner',accountId:'account-1',companyId:'company-1',
  branchId:'branch-1',actorId:'memory-owner',threadId:'thread-1',
  role:'owner',scopeType:'business',authorizationVersion:4,
};
const copy=x=>structuredClone(x);
class AtomicMockFirestore{
  state=new Map();chain=Promise.resolve();writes=0;
  collection(collectionName){
    assert.equal(collectionName,'aiNextConsentedMemoryV1');
    return {doc:id=>({id,get:async()=>this.snapshot(id)})};
  }
  snapshot(id){
    const value=this.state.get(id);
    return {exists:value!==undefined,data:()=>copy(value)};
  }
  async runTransaction(work){
    const prev=this.chain;let release;
    const next=new Promise(resolve=>{release=resolve;});
    this.chain=prev.then(()=>next);await prev;
    try{
      const changes=new Map();
      const tx={
        get:async ref=>this.snapshot(ref.id),
        set:(ref,document)=>changes.set(ref.id,copy(document)),
      };
      const result=await work(tx);
      for(const [id,document] of changes){
        this.state.set(id,document);this.writes++;
      }
      return result;
    }finally{release();}
  }
}
const backend=db=>new R07FExperimentalFirestoreKnowledgeBackend(db);
const service=db=>new ScopedKnowledgeService(backend(db));
const consent=(actor=scope.actorId)=>({
  approved:true,consentId:'consent-id-1',actorId:actor,approvedAt:createdAt,
});
const record=(overrides={})=>({
  scope,memoryId:'memory-1',content:'يفضل عرض الإجابة بالعربية',
  kind:'preference',sourceThreadId:'thread-1',sourceTurnId:'turn-1',
  sourceDocumentId:null,expiresAt:expiredAt,consent:consent(),
  ...overrides,
});
test('memory storage disabled and its root scope excludes client-write user namespace',()=>{
  assert.equal(R07F_PRODUCTION_MEMORY_STORAGE_ACTIVATED,false);
  assert.equal(R07F_MEMORY_COLLECTION,'aiNextConsentedMemoryV1');
  assert.ok(R07F_MAX_MEMORY_BYTES<1_000_000);
});
test('explicit consent is required; omitted consent produces no database write',async()=>{
  const db=new AtomicMockFirestore();
  await assert.rejects(service(db).promote(record({consent:null})),
    /AI_NEXT_MEMORY_EXPLICIT_CONSENT_REQUIRED/);
  assert.equal(db.state.size,0);
});
test('consented memory persists across independent backend/service instances',async()=>{
  const db=new AtomicMockFirestore(),a=service(db),b=service(db);
  const saved=await a.promote(record());
  assert.equal(saved.version,1);
  assert.equal(db.writes,1);
  const listed=await b.list({scope,now:createdAt});
  assert.equal(listed.length,1);
  assert.equal(listed[0].content,'يفضل عرض الإجابة بالعربية');
  assert.deepEqual(await b.exportAudit({scope}),[{
    memoryId:'memory-1',sourceTurnId:'turn-1',createdAt,
    expiresAt:expiredAt,revokedAt:null,hasContent:true,
  }]);
});
test('consented preference is visible in another thread only within same exact authority',async()=>{
  const db=new AtomicMockFirestore();
  await service(db).promote(record());
  assert.equal((await service(db).list({scope:{...scope,threadId:'thread-2'},
    now:createdAt})).length,1);
  for(const changed of [
    {ownerUid:'other-owner'},{actorId:'other-user'},
    {accountId:'other'},{companyId:'other'},
    {branchId:'other'},{role:'viewer'},{authorizationVersion:5},
  ]){
    assert.deepEqual(await service(db).list({scope:{...scope,...changed},
      now:createdAt}),[]);
  }
});
test('same consent replay never duplicates a record',async()=>{
  const db=new AtomicMockFirestore(),a=service(db);
  const first=await a.promote(record()),second=await service(db).promote(record());
  assert.equal(first.memoryId,second.memoryId);
  assert.equal((await backend(db).read(knowledgeScopeKey(scope))).records.length,1);
});
test('content or consent collision cannot overwrite existing memory',async()=>{
  const db=new AtomicMockFirestore(),a=service(db);
  await a.promote(record());
  await assert.rejects(a.promote(record({content:'different statement'})),
    /AI_NEXT_MEMORY_IDEMPOTENCY_COLLISION/);
  await assert.rejects(a.promote(record({
    consent:{...consent(),consentId:'different-consent'},
  })),/AI_NEXT_MEMORY_IDEMPOTENCY_COLLISION/);
  assert.equal((await a.list({scope,now:createdAt}))[0].content,
    'يفضل عرض الإجابة بالعربية');
});
test('revocation deletes content, persists tombstone, and blocks resurrection',async()=>{
  const db=new AtomicMockFirestore(),a=service(db);
  await a.promote(record());
  const revoked=await a.revoke({
    scope,memoryId:'memory-1',now:'2026-10-30T17:01:00.000Z',
    actorId:scope.actorId,
  });
  assert.equal(revoked.revokedAt,'2026-10-30T17:01:00.000Z');
  assert.equal(revoked.content,null);
  assert.deepEqual(await service(db).list({scope,now:'2026-10-30T17:02:00.000Z'}),[]);
  const history=await service(db).exportAudit({scope});
  assert.equal(history.length,1);
  assert.equal(history[0].hasContent,false);
  await assert.rejects(a.promote(record()),/AI_NEXT_MEMORY_REVOKED_TOMBSTONE/);
  const stored=await backend(db).read(knowledgeScopeKey(scope));
  assert.equal(stored.records[0].content,null);
  assert.equal(stored.records[0].version,2);
});
test('expired memory no longer appears in list even if stored',async()=>{
  const db=new AtomicMockFirestore(),a=service(db);
  await a.promote(record());
  assert.deepEqual(await a.list({scope,now:expiredAt}),[]);
  assert.equal((await backend(db).read(knowledgeScopeKey(scope))).records.length,1);
});
test('simultaneous new memories with same baseline reject one instead of losing changes',async()=>{
  const db=new AtomicMockFirestore(),a=service(db),b=service(db);
  const results=await Promise.allSettled([
    a.promote(record()),
    b.promote(record({
      memoryId:'memory-2',content:'ملاحظة جديدة',
      consent:{...consent(),consentId:'consent-2'},
    })),
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const saved=await backend(db).read(knowledgeScopeKey(scope));
  assert.equal(saved.records.length,1);
});
test('server-side fake record insertion without consent is denied by transition guard',async()=>{
  const db=new AtomicMockFirestore(),b=backend(db),key=knowledgeScopeKey(scope);
  await assert.rejects(b.transact(key,async current=>({
    next:{revision:current.revision+1,records:[{
      schemaVersion:1,memoryId:'memory-1',ownerKey:key,content:'made up',
      kind:'fact',sourceThreadId:'thread-1',sourceTurnId:'turn-1',
      sourceDocumentId:null,consentId:'',approvedByActorId:scope.actorId,
      createdAt,expiresAt:expiredAt,revokedAt:null,version:1,
    }]},result:1,
  })),/R07F_INVALID_CONSENT_RECORD/);
});
test('backend mutation cannot silently rewrite a consented non-revoked memory',async()=>{
  const db=new AtomicMockFirestore(),b=backend(db),a=service(db);
  await a.promote(record());
  const key=knowledgeScopeKey(scope);
  await assert.rejects(b.transact(key,async current=>({
    next:{
      revision:current.revision+1,
      records:[{...current.records[0],content:'surreptitiously changed',version:2}],
    },result:'bad',
  })),/R07F_CONSENT_REWRITE_FORBIDDEN/);
  assert.equal((await a.list({scope,now:createdAt}))[0].content,
    'يفضل عرض الإجابة بالعربية');
});
test('backend mutation cannot delete records or resurrect revoked tombstones',async()=>{
  const db=new AtomicMockFirestore(),b=backend(db),a=service(db),key=knowledgeScopeKey(scope);
  await a.promote(record());
  await assert.rejects(b.transact(key,async current=>({
    next:{revision:current.revision+1,records:[]},result:'bad',
  })),/R07F_INVALID_MEMORY_REVISION/);
  await a.revoke({scope,memoryId:'memory-1',now:'2026-10-30T17:01:00.000Z',
    actorId:scope.actorId});
  await assert.rejects(b.transact(key,async current=>({
    next:{revision:current.revision+1,
      records:[{...current.records[0],revokedAt:null,
        content:'resurrected',version:3}]},result:'bad',
  })),/R07F_CONSENT_REWRITE_FORBIDDEN/);
});
test('stored memory hash mismatch is not silently read into conversations',async()=>{
  const db=new AtomicMockFirestore(),a=service(db);
  await a.promote(record());
  const [id,existing]=[...db.state.entries()][0];
  db.state.set(id,{...existing,records:[{...existing.records[0],
    content:'tampered later'}]});
  await assert.rejects(service(db).list({scope,now:createdAt}),
    /R07F_MEMORY_HASH_MISMATCH/);
});
test('bad stored owner/scope or duplicate IDs are rejected',async()=>{
  for(const corrupt of [
    x=>({...x,scopeKey:'wrong'}),
    x=>({...x,records:[...x.records,x.records[0]]}),
    x=>({...x,rogue:'extra'}),
  ]){
    const db=new AtomicMockFirestore(),a=service(db);
    await a.promote(record());
    const [id,prev]=[...db.state.entries()][0];
    db.state.set(id,corrupt(prev));
    await assert.rejects(a.list({scope,now:createdAt}),/R07F_/);
  }
});
test('invalid memory key rejected before any Firestore access',async()=>{
  const db=new AtomicMockFirestore(),b=backend(db);
  await assert.rejects(b.read('["scope"]'),/R07F_INVALID_MEMORY_SCOPE/);
  assert.equal(db.state.size,0);
});
