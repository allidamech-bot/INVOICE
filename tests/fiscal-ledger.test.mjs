import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFiscalLedger} from '../api/_fiscal/ledger.js';
import {FIRST_PREVIOUS_INVOICE_HASH} from '../dist/src/lib/fiscal-issuance.js';

// Serialized transactional fake. Tests the ledger contract, not Firestore's emulator.
function store(){
  let data=new Map(), tail=Promise.resolve();
  const db={doc:path=>({path}),runTransaction(fn){
    const task=tail.then(async()=>{
      const staged=new Map(structuredClone([...data]));
      const tx={
        async get(ref){const value=staged.get(ref.path);return {exists:staged.has(ref.path),data:()=>structuredClone(value)};},
        create(ref,value){if(staged.has(ref.path))throw Error('exists');staged.set(ref.path,structuredClone(value));},
        update(ref,value){if(!staged.has(ref.path))throw Error('missing');staged.set(ref.path,{...staged.get(ref.path),...structuredClone(value)});}
      };
      const result=await fn(tx);data=staged;return structuredClone(result);
    });
    tail=task.catch(()=>{});return task;
  }};
  return {db,seed:(path,value)=>data.set(path,structuredClone(value)),read:path=>structuredClone(data.get(path)),size:()=>data.size};
}
const scope={accountUid:'qa-owner',workspaceId:'qa-company'};
const base='fiscalPrivateV1/qa-owner/workspaces/qa-company';
const xml=Buffer.from('synthetic xml'), snapshot=Buffer.from('synthetic snapshot'), result=Buffer.from('synthetic result'), cleared=Buffer.from('synthetic clearance');
const digest=b=>createHash('sha256').update(b).digest('hex');
const hash=Buffer.alloc(32,1).toString('base64');
const at='2026-11-18T10:00:00.000Z', later='2026-11-18T10:01:00.000Z';
const input={...scope,egsId:'qa-egs',documentId:'qa-doc',uuid:'11111111-1111-4111-8111-111111111111',icv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH,invoiceHash:hash,artifactDigest:digest(xml),snapshotDigest:digest(snapshot),generatedAt:at,mode:'clearance'};
function fixture(){
  const s=store(), ledger=createFiscalLedger(s.db);
  s.seed(base+'/egs/qa-egs',{...scope,egsId:'qa-egs',active:true,nextIcv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH});
  return {...s,ledger,prepare:(patch={})=>ledger.prepare(scope,{...input,...patch},xml,snapshot)};
}
test('atomic prepare reserves EGS sequence, UUID, artifacts, audit and outbox exactly once',async()=>{
  const f=fixture(), a=await f.prepare(), b=await f.prepare();
  assert.deepEqual(a,b);assert.equal(f.size(),7);
  assert.equal(f.read(base+'/egs/qa-egs').nextIcv,'2');
  assert.equal(f.read(base+'/egs/qa-egs').previousInvoiceHash,hash);
  assert.equal(f.read(base+'/outbox/qa-doc').state,'ready');
  assert.equal(f.read(base+'/issues/qa-doc/artifacts/prepared').sha256,digest(xml));
});
test('concurrent candidates cannot take same chain slot or reuse UUID',async()=>{
  const f=fixture();
  const outcomes=await Promise.allSettled([f.prepare(),f.prepare({documentId:'other',uuid:'22222222-2222-4222-8222-222222222222'})]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(f.read(base+'/egs/qa-egs').nextIcv,'2');
  await assert.rejects(f.prepare({documentId:'third',icv:'2',previousInvoiceHash:hash}),/UUID already/);
  await f.prepare({documentId:'third',uuid:'33333333-3333-4333-8333-333333333333',icv:'2',previousInvoiceHash:hash});
  assert.equal(f.read(base+'/egs/qa-egs').nextIcv,'3');
});
test('cross-scope, inactive EGS and changed artifacts fail without persisting records',async()=>{
  const f=fixture();
  await assert.rejects(f.ledger.prepare({...scope,workspaceId:'other'},input,xml,snapshot),/scope mismatch/);
  await assert.rejects(f.ledger.prepare(scope,input,Buffer.from('changed'),snapshot),/artifact/);
  await assert.rejects(f.prepare({egsId:'absent'}),/scope mismatch/);
  assert.equal(f.size(),1);
  await f.prepare();
  await assert.rejects(f.prepare({mode:'reporting'}),/already bound/);
  assert.equal(f.size(),7);
});
test('versioned transitions atomically store evidence, close queue and retain original artifact',async()=>{
  const f=fixture();await f.prepare();
  const start={kind:'start',attemptId:'qa-attempt',at:later};
  const started=await f.ledger.transition(scope,'qa-doc',1,start);
  assert.equal(started.version,2);assert.equal(f.read(base+'/outbox/qa-doc').state,'hold');
  await assert.rejects(f.ledger.transition(scope,'qa-doc',1,start),/Stale fiscal version/);
  const event={kind:'cleared',attemptId:'qa-attempt',at:later,resultDigest:digest(result),clearedArtifactDigest:digest(cleared),warnings:false};
  await assert.rejects(f.ledger.transition(scope,'qa-doc',2,event,Buffer.from('bad'),cleared),/artifact/);
  assert.equal(f.read(base+'/issues/qa-doc').version,2);
  const final=await f.ledger.transition(scope,'qa-doc',2,event,result,cleared);
  assert.equal(final.status,'cleared');assert.equal(f.read(base+'/outbox/qa-doc').state,'closed');
  assert.equal(f.read(base+'/issues/qa-doc/events/3/artifacts/result').sha256,digest(result));
  assert.equal(f.read(base+'/issues/qa-doc/artifacts/cleared').sha256,digest(cleared));
  assert.equal(f.read(base+'/issues/qa-doc/artifacts/prepared').sha256,digest(xml));
});
test('concurrent state transitions enforce version CAS; uncertain outbox stays on hold',async()=>{
  const f=fixture();await f.prepare();
  const outcomes=await Promise.allSettled(['a','b'].map(attemptId=>f.ledger.transition(scope,'qa-doc',1,{kind:'start',attemptId,at:later})));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  const attemptId=f.read(base+'/issues/qa-doc').attemptId;
  await f.ledger.transition(scope,'qa-doc',2,{kind:'uncertain',attemptId,at:later});
  assert.equal(f.read(base+'/outbox/qa-doc').state,'hold');
  await assert.rejects(f.ledger.transition(scope,'qa-doc',3,{kind:'start',attemptId:'c',at:later}),/eligible/);
});


import {createFiscalSimulationWorker} from '../api/_fiscal/simulation-worker.js';
const simScope={...scope,egsId:'qa-egs',environment:'simulation'};
function simulationFixture(response,verifyPrepared=async()=>true,verifyAuthorityResult=async()=>true){
  const f=fixture();f.seed(base+'/egs/qa-egs',{...scope,egsId:'qa-egs',active:true,environment:'simulation',nextIcv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH});
  let calls=0, attempts=0;
  const worker=createFiscalSimulationWorker({ledger:f.ledger,resolveCredential:async()=>({...simScope,kind:'production',binarySecurityToken:Buffer.from('qa-cert').toString('base64'),secret:'qa-secret'}),verifyPrepared,verifyAuthorityResult,clock:()=>later,attemptId:()=>`attempt-${++attempts}`,fetchImpl:async(url,req)=>{calls++;assert.match(url,/\/simulation\/invoices\//);assert.equal(JSON.parse(req.body).invoice,xml.toString('base64'));return new Response(JSON.stringify(response),{status:200});}});
  return {...f,worker,calls:()=>calls};
}
const valid={validationResults:{status:'PASS',errorMessages:[],warningMessages:[]}};
test('integrated worker claims once, sends immutable bytes and persists verified clearance',async()=>{
  const f=simulationFixture({...valid,clearanceStatus:'CLEARED',clearedInvoice:cleared.toString('base64')});await f.prepare();
  const outcomes=await Promise.allSettled([f.worker(simScope,'qa-doc',1),f.worker(simScope,'qa-doc',1)]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls(),1);
  assert.equal(f.read(base+'/issues/qa-doc').status,'cleared');assert.equal(f.read(base+'/outbox/qa-doc').state,'closed');
  assert.equal(f.read(base+'/issues/qa-doc/artifacts/cleared').sha256,digest(cleared));
});
test('integrated reporting confirms only verified authority response',async()=>{
  const f=simulationFixture({...valid,reportingStatus:'REPORTED'});await f.prepare({mode:'reporting'});
  assert.equal((await f.worker(simScope,'qa-doc',1)).status,'reported');assert.equal(f.calls(),1);
  const g=simulationFixture({...valid,reportingStatus:'REPORTED'},async()=>true,async()=>false);await g.prepare({mode:'reporting'});
  assert.equal((await g.worker(simScope,'qa-doc',1)).status,'uncertain');assert.equal(g.read(base+'/outbox/qa-doc').state,'hold');
  await assert.rejects(g.worker(simScope,'qa-doc',3));assert.equal(g.calls(),1);
});
test('failed artifact verification and corrupted storage never reach transport',async()=>{
  const f=simulationFixture({},async()=>false);await f.prepare();assert.equal((await f.worker(simScope,'qa-doc',1)).status,'uncertain');assert.equal(f.calls(),0);
  const g=simulationFixture({});await g.prepare();g.seed(base+'/issues/qa-doc/artifacts/prepared',{sha256:digest(xml),bytes:Buffer.from('corrupt').toString('base64')});
  await assert.rejects(g.worker(simScope,'qa-doc',1),/artifact/);assert.equal(g.calls(),0);assert.equal(g.read(base+'/issues/qa-doc').status,'queued');
});
test('worker fails closed for production, wrong EGS and unconfirmed response',async()=>{
  const f=simulationFixture({});await f.prepare();
  await assert.rejects(f.worker({...simScope,environment:'production'},'qa-doc',1),/PRODUCTION_DISABLED/);
  await assert.rejects(f.worker({...simScope,egsId:'other'},'qa-doc',1));assert.equal(f.calls(),0);
  assert.equal((await f.worker(simScope,'qa-doc',1)).status,'uncertain');assert.equal(f.calls(),1);
});
