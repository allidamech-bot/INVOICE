import test from 'node:test';
import assert from 'node:assert/strict';
import {
  R07JExperimentalIndexedJournal,R07J_INDEXED_APPEND_ACTIVE,
  R07J_COLLECTION,
} from '../../dist/src/ai-next/storage/firestore-indexed-append.js';
import {transitionTask} from '../../dist/src/ai-next/domain/state-machine.js';
const stamp='2026-10-31T10:00:00.000Z';
const scope={ownerUid:'r07j-owner',accountId:'r07j-account',
  companyId:'r07j-company',branchId:'r07j-branch',
  threadId:'r07j-thread',actorId:'r07j-owner',role:'owner',
  scopeType:'business',authorizationVersion:1};
const clone=x=>structuredClone(x);
class SharedDB{
  docs=new Map();lock=Promise.resolve();reads=0;writes=0;
  collection(name){
    assert.equal(name,R07J_COLLECTION);
    return {doc:id=>({id,get:async()=>this.snapshot(id)})};
  }
  snapshot(id){
    this.reads++;
    const data=this.docs.get(id);
    return {exists:data!==undefined,data:()=>data===undefined?undefined:clone(data)};
  }
  async runTransaction(action){
    const previous=this.lock;let release;
    const waiting=new Promise(r=>{release=r;});
    this.lock=previous.then(()=>waiting);await previous;
    try{
      const edits=new Map();
      const tx={get:async ref=>this.snapshot(ref.id),
        create:(ref,value)=>{
          if(this.docs.has(ref.id)||edits.has(ref.id))throw Error('ALREADY_EXISTS');
          edits.set(ref.id,clone(value));
        },
        set:(ref,value)=>{edits.set(ref.id,clone(value));}};
      const out=await action(tx);
      for(const [k,v] of edits){this.docs.set(k,v);this.writes++;}
      return out;
    }finally{release();}
  }
  tamper(predicate,cb){
    const entry=[...this.docs].find(([k,v])=>predicate(k,v));
    assert.ok(entry);
    this.docs.set(entry[0],cb(clone(entry[1])));
  }
}
const journal=db=>new R07JExperimentalIndexedJournal(db);
function begin(){
  const turn={
    schemaVersion:1,scope:clone(scope),turnId:'turn-one',
    threadId:scope.threadId,userMessageId:'u-one',requestId:'req-one',
    idempotencyKey:'turn-input-one',sequenceNumber:1,parentTurnId:null,
    userMessage:{text:'مرحبا',languageHint:'ar',attachedSourceIds:[]},
    mode:'advisor',receivedAt:stamp,stateVersion:0,
    selectedSourceIds:[],taskId:'task-one',lifecycle:'received',
    outputResultId:null,
  };
  const task={
    schemaVersion:1,scope:clone(scope),taskId:'task-one',
    threadId:scope.threadId,turnId:'turn-one',
    taskType:'conversation',state:'created',revision:0,stateVersion:0,
    startedAt:stamp,updatedAt:stamp,completedAt:null,stageIndex:0,
    progress:{completedUnits:0,totalUnits:null,unitType:'unknown',observedAt:stamp},
    currentCheckpointId:null,sourceIds:[],draftId:null,approvalId:null,
    lastError:null,cancellable:true,retryPolicy:'safe_only',executionOperationId:null,
  };
  return {scope,expectedRevision:0,eventId:'e-start',idempotencyKey:'id-start',
    body:{kind:'turn_started',turn,task},now:stamp};
}
function message(rev,overrides={}){
  return {scope,expectedRevision:rev,eventId:'e-'+rev,
    idempotencyKey:'id-'+rev,
    body:{kind:'message',messageId:'m-'+rev,turnId:'turn-one',
      role:'assistant',text:'Synthetic message '+rev,sourceIds:[]},
    now:stamp,...overrides};
}
test('R07J inactive isolated collection; actual append does not require event replay',async()=>{
  assert.equal(R07J_INDEXED_APPEND_ACTIVE,false);
  assert.equal(R07J_COLLECTION,'aiNextIndexedEventThreadsV1');
  const db=new SharedDB();
  assert.equal((await journal(db).append(begin())).revision,1);
  let maxReads=0;
  for(let r=1;r<=320;r++){
    const prev=db.reads;
    const out=await journal(db).append(message(r));
    assert.equal(out.revision,r+1);
    assert.equal(out.authoritativeFullSnapshot,false);
    maxReads=Math.max(maxReads,db.reads-prev);
  }
  assert.ok(maxReads<=10,'bounded per-message document read count');
  const state=await journal(db).auditFullHistory(scope);
  assert.equal(state.revision,321);
  assert.equal(state.messages.length,320);
  assert.equal(state.lastHash,(await journal(db).append(message(320))).lastHash);
});
test('R07J persistent exact replay returns no mutation; conflicting body fails',async()=>{
  const db=new SharedDB(),a=journal(db),b=journal(db);
  await a.append(begin());await a.append(message(1));
  const count=db.writes;
  const replay=await b.append(message(1,{expectedRevision:1}));
  assert.equal(replay.replayed,true);
  assert.equal(replay.revision,2);
  assert.equal(db.writes,count);
  await assert.rejects(b.append(message(1,{
    body:{...message(1).body,text:'changed'},
  })),/R07J_IDEMPOTENCY_COLLISION/);
  assert.equal(db.writes,count);
});
test('R07J rejects duplicate message IDs and event IDs across new keys',async()=>{
  const db=new SharedDB(),a=journal(db);
  await a.append(begin());await a.append(message(1));
  await assert.rejects(a.append(message(2,{
    eventId:'e-1',idempotencyKey:'unique-two',
  })),/R07J_DUPLICATE_EVENT_ID/);
  await assert.rejects(a.append(message(2,{
    eventId:'unique-other',idempotencyKey:'unique-other',
    body:{...message(2).body,messageId:'m-1'},
  })),/R07J_DUPLICATE_MESSAGE_ID/);
  assert.equal((await a.auditFullHistory(scope)).revision,2);
});
test('R07J rejects missing turn, invalid next turn and stale expected revision',async()=>{
  const db=new SharedDB(),a=journal(db);
  await assert.rejects(a.append(message(0)),/R07J_MESSAGE_TURN_UNKNOWN/);
  await a.append(begin());
  await assert.rejects(a.append({...begin(),expectedRevision:1,
    eventId:'new-turn',idempotencyKey:'new-idem',
    body:{kind:'turn_started',turn:{
      ...begin().body.turn,turnId:'turn-two',sequenceNumber:2,
      parentTurnId:'turn-one',taskId:'task-two'},
      task:{...begin().body.task,taskId:'task-two',turnId:'turn-two'}}}),
  /R07J_INVALID_TURN_SEQUENCE/);
  await assert.rejects(a.append(message(0)),/R07J_STALE_REVISION/);
});
test('R07J concurrent writers yield one success and one safe conflict',async()=>{
  const db=new SharedDB();await journal(db).append(begin());
  const results=await Promise.allSettled([
    journal(db).append(message(1)),
    journal(db).append(message(1,{
      eventId:'e-different',idempotencyKey:'id-different',
      body:{...message(1).body,messageId:'m-different'}})),
  ]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,1);
  assert.equal((await journal(db).auditFullHistory(scope)).revision,2);
});
test('R07J task state CAS and checkpoint match full R03 projection',async()=>{
  const db=new SharedDB(),a=journal(db),original=begin();
  await a.append(original);
  const updated=transitionTask(original.body.task,'understanding',{
    expectedStateVersion:0,now:stamp,
  });
  const result=await a.append({scope,expectedRevision:1,
    eventId:'task-update-1',idempotencyKey:'task-idem-1',
    body:{kind:'task_updated',task:updated},now:stamp});
  assert.equal(result.revision,2);
  await assert.rejects(a.append({scope,expectedRevision:2,
    eventId:'task-update-2',idempotencyKey:'task-idem-2',
    body:{kind:'task_updated',task:updated},now:stamp}),
  /R07J_STALE_TASK_EVENT/);
  const cp={scope,expectedRevision:2,eventId:'cp-1',idempotencyKey:'cp-idem',
    body:{kind:'checkpoint',taskId:'task-one',checkpointId:'checkpoint-one',
      sourceIds:[],referenceHash:'a'.repeat(64),stage:'processing'},now:stamp};
  await a.append(cp);
  const state=await a.auditFullHistory(scope);
  assert.equal(state.tasks[0].state,'understanding');
  assert.equal(state.checkpointRefs.length,1);
});
test('R07J tenanted/authorization epoch scope changes get isolated empty history',async()=>{
  const db=new SharedDB(),a=journal(db);await a.append(begin());
  for(const update of [{ownerUid:'elsewhere'},{companyId:'elsewhere'},
    {branchId:'elsewhere'},{authorizationVersion:2},{actorId:'elsewhere'},
    {threadId:'elsewhere'}]){
    assert.equal((await a.auditFullHistory({...scope,...update})).revision,0);
  }
});
test('R07J sealed history fails closed on arbitrary modified stored event',async()=>{
  const db=new SharedDB(),a=journal(db);
  await a.append(begin());await a.append(message(1));
  db.tamper(k=>k.endsWith(':event:000002'),v=>({...v,body:{
    ...v.body,text:'overwritten'}}));
  await assert.rejects(a.auditFullHistory(scope),/AI_NEXT_DAMAGED_EVENT_HASH/);
});
test('R07J replay rejects missing indexed authoritative original event',async()=>{
  const db=new SharedDB(),a=journal(db);
  await a.append(begin());await a.append(message(1));
  const key=[...db.docs.keys()].find(x=>x.endsWith(':event:000002'));
  db.docs.delete(key);
  await assert.rejects(a.append(message(1)),/R07J_RECEIPT_EVENT_DIVERGENCE/);
});
