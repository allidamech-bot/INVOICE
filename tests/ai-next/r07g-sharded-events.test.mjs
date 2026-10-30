import test from 'node:test';
import assert from 'node:assert/strict';
import {
  R07GExperimentalShardedEventBackend,R07G_COLLECTION,
  R07G_PRODUCTION_SHARDED_STORAGE_ACTIVATED,R07G_CHUNK_EVENTS,
  R07G_CHUNK_BYTES,R07G_MAX_CHUNKS,
} from '../../dist/src/ai-next/storage/firestore-sharded-events.js';
import {ScopedConversationLedger,MAX_R03_EVENTS}
  from '../../dist/src/ai-next/conversation-state/event-store.js';
import {exactScopeKey} from '../../dist/src/ai-next/domain/turn-journal.js';

const NOW='2026-10-30T17:00:00.000Z';
const scope={
  ownerUid:'r07g-owner',accountId:'r07g-account',companyId:'r07g-company',
  branchId:'r07g-branch',threadId:'r07g-long-thread',
  actorId:'r07g-owner',role:'owner',scopeType:'business',
  authorizationVersion:1,
};
const clone=x=>structuredClone(x);
class SerialFirestoreMock{
  data=new Map();locks=Promise.resolve();writes=0;reads=0;
  collection(name){
    assert.equal(name,R07G_COLLECTION);
    return {doc:id=>({id,get:async()=>this.snapshot(id)})};
  }
  snapshot(id){
    this.reads++;
    const record=this.data.get(id);
    return {exists:record!==undefined,
      data:()=>record===undefined?undefined:clone(record)};
  }
  async runTransaction(action){
    const previous=this.locks;let unlock;
    const lock=new Promise(resolve=>{unlock=resolve;});
    this.locks=previous.then(()=>lock);await previous;
    try{
      const edits=new Map();
      const tx={
        get:async ref=>this.snapshot(ref.id),
        set:(ref,body)=>edits.set(ref.id,clone(body)),
        create:(ref,body)=>{
          if(this.data.has(ref.id)||edits.has(ref.id))
            throw Error('ALREADY_EXISTS');
          edits.set(ref.id,clone(body));
        },
      };
      const result=await action(tx);
      for(const [k,v] of edits){
        this.data.set(k,v);this.writes++;
      }
      return result;
    }finally{unlock();}
  }
  head(){return [...this.data.entries()].find(([k])=>k.endsWith(':head'))?.[1];}
  chunks(){return [...this.data.entries()].filter(([k])=>k.includes(':chunk:'));}
}
const backend=db=>new R07GExperimentalShardedEventBackend(db);
const ledger=db=>new ScopedConversationLedger(backend(db));
const start=()=>{
  const turn={
    schemaVersion:1,scope:clone(scope),
    turnId:'turn-1',threadId:scope.threadId,userMessageId:'u-1',
    requestId:'request-1',idempotencyKey:'unique-turn-1',
    sequenceNumber:1,parentTurnId:null,
    userMessage:{text:'مرحبا',languageHint:'ar',attachedSourceIds:[]},
    mode:'advisor',receivedAt:NOW,stateVersion:0,
    selectedSourceIds:[],taskId:'task-1',lifecycle:'received',outputResultId:null,
  };
  const task={
    schemaVersion:1,scope:clone(scope),
    taskId:'task-1',threadId:scope.threadId,turnId:'turn-1',
    taskType:'greeting',state:'created',revision:0,stateVersion:0,
    startedAt:NOW,updatedAt:NOW,completedAt:null,stageIndex:0,
    progress:{completedUnits:0,totalUnits:null,unitType:'unknown',observedAt:NOW},
    currentCheckpointId:null,sourceIds:[],draftId:null,approvalId:null,
    lastError:null,cancellable:true,retryPolicy:'safe_only',executionOperationId:null,
  };
  return {
    scope,expectedRevision:0,eventId:'ev-start',
    idempotencyKey:'event-key-start',
    body:{kind:'turn_started',turn,task},now:NOW,
  };
};
const message=(revision,text='synthetic-message')=>({
  scope,expectedRevision:revision,eventId:'event-'+revision,
  idempotencyKey:'event-key-'+revision,
  body:{
    kind:'message',messageId:'message-'+revision,
    turnId:'turn-1',role:'assistant',text,sourceIds:[],
  },now:NOW,
});
test('R07G remains disabled; sharded contract targets R03 not unlimited claims',()=>{
  assert.equal(R07G_PRODUCTION_SHARDED_STORAGE_ACTIVATED,false);
  assert.equal(R07G_COLLECTION,'aiNextEventShardsV1');
  assert.equal(R07G_CHUNK_EVENTS,96);
  assert.ok(R07G_CHUNK_BYTES<1_000_000);
  assert.ok(R07G_MAX_CHUNKS<=1024);
  assert.equal(MAX_R03_EVENTS,20000);
});
test('R07G true R03 event ledger exceeds R07A 300 events with exact history and replay',async()=>{
  const db=new SerialFirestoreMock(),a=ledger(db);
  const first=await a.append(start());
  assert.equal(first.snapshot.revision,1);
  for(let revision=1;revision<325;revision++){
    const result=await a.append(message(revision));
    assert.equal(result.snapshot.revision,revision+1);
  }
  assert.equal(db.head().revision,325);
  assert.equal(db.chunks().length,4);
  assert.deepEqual(db.head().chunks.map(d=>d.end),[96,192,288,325]);
  const b=ledger(db);
  const history=await b.snapshot(scope);
  assert.equal(history.revision,325);
  assert.equal(history.messages.length,324);
  assert.equal(history.messages.at(-1).messageId,'message-324');
  assert.equal(history.lastHash,db.head().lastHash);
  const replay=await b.append(message(324));
  assert.equal(replay.replayed,true);
  assert.equal(replay.snapshot.revision,325);
  assert.equal(db.chunks().length,4);
  assert.equal((await ledger(db).snapshot(scope)).messages.length,324);
});
test('replay of same event across instances is read-only without extra write',async()=>{
  const db=new SerialFirestoreMock();
  await ledger(db).append(start());
  const count=db.writes;
  const replay=await ledger(db).append(start());
  assert.equal(replay.replayed,true);
  assert.equal(db.writes,count);
});
test('simultaneous different events allow exactly one revision',async()=>{
  const db=new SerialFirestoreMock();
  await ledger(db).append(start());
  const results=await Promise.allSettled([
    ledger(db).append(message(1,'first')),
    ledger(db).append({...message(1,'second'),eventId:'other-event',
      idempotencyKey:'other-key',
      body:{kind:'message',messageId:'other-message',turnId:'turn-1',
        role:'assistant',text:'second',sourceIds:[]}}),
  ]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  assert.equal((await ledger(db).snapshot(scope)).revision,2);
});
test('different actor, company, branch, account, thread or auth epoch sees empty scope',async()=>{
  const db=new SerialFirestoreMock();
  await ledger(db).append(start());
  for(const other of [
    {actorId:'other'}, {companyId:'other'}, {branchId:'other'},
    {accountId:'other'}, {threadId:'other'}, {authorizationVersion:2},
    {ownerUid:'other'},
  ]){
    assert.equal((await ledger(db).snapshot({...scope,...other})).revision,0);
  }
});
test('missing sealed historical shard fails closed; no silent truncated history',async()=>{
  const db=new SerialFirestoreMock(),a=ledger(db);
  await a.append(start());
  for(let i=1;i<=97;i++)await a.append(message(i));
  const first=db.chunks().find(([k])=>k.endsWith(':00000'))?.[0];
  assert.ok(first);
  db.data.delete(first);
  await assert.rejects(ledger(db).snapshot(scope),
    /R07G_MISSING_OR_CORRUPT_CHUNK/);
});
test('tampering with old chunk, metadata, sequence and hash fails closed',async()=>{
  for(const tamper of [
    (db,id,doc)=>{doc.events[0].body.messageId='altered';db.data.set(id,doc);},
    (db,id,doc)=>{doc.events[0].hash='a'.repeat(64);db.data.set(id,doc);},
    (db,id,doc)=>{doc.events[0].sequence=99;db.data.set(id,doc);},
  ]){
    const db=new SerialFirestoreMock(),a=ledger(db);
    await a.append(start());await a.append(message(1));
    const [id,chunk]=db.chunks()[0];
    tamper(db,id,clone(chunk));
    await assert.rejects(ledger(db).snapshot(scope),
      /R07G_(CHUNK_HASH_MISMATCH|DAMAGED_CHUNK_CHAIN)/);
  }
});
test('corrupted head or noncontiguous descriptor prevents reconstruction',async()=>{
  const db=new SerialFirestoreMock(),a=ledger(db);
  await a.append(start());
  for(const [id,doc] of db.data){
    if(id.endsWith(':head'))db.data.set(id,{...doc,
      chunks:[{...doc.chunks[0],start:2}]});
  }
  await assert.rejects(a.snapshot(scope),/R07G_INVALID_HEAD_CHAIN/);
});
test('chunk bytes bound causes rotation before event count limit',async()=>{
  const db=new SerialFirestoreMock(),a=ledger(db);
  await a.append(start());
  for(let i=1;i<=9;i++)await a.append(message(i,'x'.repeat(80000)));
  assert.ok(db.chunks().length>=2);
  for(const [,chunk] of db.chunks())
    assert.ok(new TextEncoder().encode(JSON.stringify(chunk)).length<=R07G_CHUNK_BYTES);
  assert.equal((await ledger(db).snapshot(scope)).revision,10);
});
test('caller cannot rewrite, truncate, or introduce multi-event transition',async()=>{
  const db=new SerialFirestoreMock(),b=backend(db);
  await ledger(db).append(start());
  const key=exactScopeKey(scope);
  for(const prepare of [
    old=>({revision:old.revision,events:[]}),
    old=>({revision:old.revision+1,events:[...old.events,
      {...old.events[0],sequence:2,previousHash:'1'.repeat(64)}]}),
    old=>({revision:old.revision+2,events:[...old.events,
      {...old.events[0],sequence:2}, {...old.events[0],sequence:3}]}),
  ]){
    await assert.rejects(b.transact(key,async old=>({
      next:prepare(old),result:1,
    })),/R07G_(ILLEGAL_NOOP|INVALID_NEW_EVENT|NOT_SINGLE_APPEND)/);
  }
  assert.equal((await ledger(db).snapshot(scope)).revision,1);
});
test('same-scope direct backend callback invoked once under concurrent conflict',async()=>{
  const db=new SerialFirestoreMock(),b=backend(db),key=exactScopeKey(scope);
  let invocations=0;
  await b.transact(key,async current=>{
    invocations++;
    return {next:current,result:10};
  });
  assert.equal(invocations,1);
  assert.equal(db.writes,0);
});
test('bad full scope keys are rejected before reading any database documents',async()=>{
  const db=new SerialFirestoreMock(),b=backend(db);
  for(const bad of [
    'junk','[]',JSON.stringify(['owner','account']),
    JSON.stringify([...JSON.parse(exactScopeKey(scope)),null]),
  ]){
    await assert.rejects(b.read(bad),/R07G_INVALID_SCOPE_KEY/);
  }
  assert.equal(db.reads,0);
});


test('R07I display window reads only recent shards, no full history or writes',async()=>{
  const db=new SerialFirestoreMock(),a=ledger(db);
  await a.append(start());
  for(let r=1;r<=220;r++)await a.append(message(r));
  const b=backend(db),key=exactScopeKey(scope),before=db.writes;
  const beforeReads=db.reads;
  const recent=await b.readRecentWindow(key,25);
  const windowReads=db.reads-beforeReads;
  const fullReadsBefore=db.reads;
  const full=await b.read(key);
  const fullReads=db.reads-fullReadsBefore;
  assert.equal(recent.revision,221);
  assert.equal(recent.events.length,25);
  assert.equal(recent.firstSequence,197);
  assert.equal(recent.events[0].sequence,197);
  assert.equal(recent.events.at(-1).sequence,221);
  assert.equal(recent.lastHash,full.events.at(-1).hash);
  assert.equal(recent.previousHash,full.events[195].hash);
  assert.equal(recent.completeHistory,false);
  assert.equal(recent.authoritativeForMutation,false);
  assert.equal(recent.events.every((e,i)=>e.sequence===197+i),true);
  assert.ok(windowReads<fullReads,
    'a bounded recent window must read fewer Firestore documents');
  assert.equal(db.writes,before);
});
test('R07I short thread provides complete read-only window and enforces limits',async()=>{
  const db=new SerialFirestoreMock(),b=backend(db),key=exactScopeKey(scope);
  const empty=await b.readRecentWindow(key,10);
  assert.deepEqual([empty.revision,empty.firstSequence,empty.completeHistory,
    empty.authoritativeForMutation],[0,0,true,false]);
  await ledger(db).append(start());
  const one=await b.readRecentWindow(key,128);
  assert.equal(one.completeHistory,true);
  assert.equal(one.firstSequence,1);
  assert.equal(one.events.length,1);
  for(const bad of [0,129,-1,1.25,NaN,Infinity,'12',null]){
    await assert.rejects(b.readRecentWindow(key,bad),
      /R07I_INVALID_WINDOW_LIMIT/);
  }
});
test('R07I missing old shards cannot masquerade as authoritative full replay',async()=>{
  const db=new SerialFirestoreMock(),a=ledger(db);
  await a.append(start());
  for(let r=1;r<=104;r++)await a.append(message(r));
  const firstShard=db.chunks().find(([id])=>id.endsWith(':00000'))[0];
  db.data.delete(firstShard);
  const tail=await backend(db).readRecentWindow(exactScopeKey(scope),5);
  assert.equal(tail.revision,105);
  assert.equal(tail.events.length,5);
  assert.equal(tail.completeHistory,false);
  assert.equal(tail.authoritativeForMutation,false);
  await assert.rejects(a.snapshot(scope),/R07G_MISSING_OR_CORRUPT_CHUNK/);
});
test('R07I read-only tail fails closed on tampered included chunk',async()=>{
  const db=new SerialFirestoreMock(),a=ledger(db);
  await a.append(start());
  for(let r=1;r<=104;r++)await a.append(message(r));
  const [id,document]=db.chunks().find(([key])=>key.endsWith(':00001'));
  const changed=clone(document);
  changed.events.at(-1).body.text='secretly overwritten';
  db.data.set(id,changed);
  await assert.rejects(
    backend(db).readRecentWindow(exactScopeKey(scope),4),
    /R07G_CHUNK_HASH_MISMATCH/);
});
