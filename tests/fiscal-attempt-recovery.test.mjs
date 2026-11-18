import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFiscalLedger} from '../api/_fiscal/ledger.js';
import {createFiscalSimulationWorker} from '../api/_fiscal/simulation-worker.js';
import {createZatcaSimulationClient} from '../api/_fiscal/zatca-simulation.js';
import {FIRST_PREVIOUS_INVOICE_HASH} from '../dist/src/lib/fiscal-issuance.js';
const scope={environment:'simulation',accountUid:'owner',workspaceId:'company',egsId:'egs'},doc='doc',attempt='attempt';
const base='fiscalPrivateV1/owner/workspaces/company',path=base+'/issues/'+doc,receiptPath=path+'/attemptResponses/'+attempt;
const at='2026-11-18T10:00:00.000Z',later='2026-11-18T10:06:00.000Z',xml=Buffer.from('<synthetic/>'),snapshot=Buffer.from('{}'),cleared=Buffer.from('<cleared/>');
const sha=b=>createHash('sha256').update(b).digest('hex');
const payload={uuid:'11111111-1111-4111-8111-111111111111',invoiceHash:Buffer.alloc(32,1).toString('base64'),invoice:xml.toString('base64')};
const credential={...scope,kind:'production',binarySecurityToken:Buffer.from('synthetic certificate').toString('base64'),secret:'synthetic-secret'};
const accepted=Buffer.from(JSON.stringify({clearanceStatus:'CLEARED',clearedInvoice:cleared.toString('base64'),validationResults:{status:'PASS',errorMessages:[],warningMessages:[]}}));
function fixture({mode='clearance',raw=accepted,failJournal=false,verify=async()=>true}={}){
  let rows=new Map(),tail=Promise.resolve(),calls=0,checks=0;
  const db={doc:path=>({path}),runTransaction(fn){const task=tail.then(async()=>{const staged=new Map(structuredClone([...rows]));let writing=false;const tx={async get(ref){assert.equal(writing,false,'Firestore requires reads before writes');return {exists:staged.has(ref.path),data:()=>structuredClone(staged.get(ref.path))};},create(ref,value){writing=true;if(failJournal&&ref.path===receiptPath)throw Error('simulated storage outage');if(staged.has(ref.path))throw Error('already exists');staged.set(ref.path,structuredClone(value));},update(ref,value){writing=true;assert.ok(staged.has(ref.path));staged.set(ref.path,{...staged.get(ref.path),...structuredClone(value)});}};const result=await fn(tx);rows=staged;return result;});tail=task.catch(()=>{});return task;}};
  rows.set(base+'/egs/egs',{...scope,active:true,nextIcv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH});
  const ledger=createFiscalLedger(db),record={...scope,documentId:doc,uuid:payload.uuid,invoiceHash:payload.invoiceHash,icv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH,artifactDigest:sha(xml),snapshotDigest:sha(snapshot),generatedAt:at,mode};
  const worker=createFiscalSimulationWorker({ledger,resolveCredential:async()=>credential,verifyPrepared:async()=>true,verifyAuthorityResult:async args=>{checks++;assert.equal(rows.get(receiptPath)?.digest,sha(raw));return verify(args);},clock:()=>at,attemptId:()=>attempt,fetchImpl:async()=>{calls++;return new Response(raw,{status:200});}});
  return {ledger,worker,prepare:()=>ledger.prepare(scope,record,xml,snapshot),read:p=>rows.get(p),calls:()=>calls,checks:()=>checks,seed:(p,v)=>rows.set(p,v)};
}
const metadata=(bytes,receivedAt=at)=>({httpStatus:200,bytes,digest:sha(bytes),receivedAt});
test('worker commits receipt before verification, then accepted artifact and audit in real ledger',async()=>{
  const f=fixture();await f.prepare();assert.equal((await f.worker(scope,doc,1)).status,'cleared');assert.equal(f.calls(),1);assert.equal(f.checks(),1);assert.equal(f.read(receiptPath).digest,sha(accepted));
  const final=await f.ledger.readAccepted(scope,doc);assert.deepEqual(final.xml,cleared);assert.deepEqual(final.evidence,accepted);
});
test('malformed complete response is retained and held; it is never accepted or sent twice',async()=>{
  for(const raw of [Buffer.from('<html>gateway failure</html>'),Buffer.from([0xff,0xfe]),Buffer.from('[]')]){const f=fixture({raw});await f.prepare();assert.equal((await f.worker(scope,doc,1)).status,'uncertain');assert.equal(f.checks(),0);const saved=await f.ledger.readResponse(scope,doc,2,attempt);assert.deepEqual(saved.bytes,raw);assert.equal(f.read(path+'/events/3').unverifiedEvidenceDigest,sha(raw));await assert.rejects(f.worker(scope,doc,3));assert.equal(f.calls(),1);}
});
test('journal outage blocks verification and leaves claimed submission on hold',async()=>{
  const f=fixture({failJournal:true});await f.prepare();await assert.rejects(f.worker(scope,doc,1),/FISCAL_RESPONSE_DURABILITY_FAILED/);assert.equal(f.checks(),0);assert.equal(f.read(path).status,'submitting');assert.equal(f.read(base+'/outbox/doc').state,'hold');await assert.rejects(f.worker(scope,doc,2));assert.equal(f.calls(),1);
  await assert.rejects(f.ledger.recoverInterrupted(scope,doc,2,attempt,at),/NOT_ELIGIBLE/);assert.equal((await f.ledger.recoverInterrupted(scope,doc,2,attempt,later)).status,'uncertain');
});
test('stalled submission recovery atomically records saved evidence; no replay or false acceptance',async()=>{
  const f=fixture();await f.prepare();await f.ledger.claim(scope,doc,1,attempt,at);const raw=Buffer.alloc(700000,120);await f.ledger.recordResponse(scope,doc,2,attempt,metadata(raw));await f.ledger.recordResponse(scope,doc,2,attempt,metadata(raw));await assert.rejects(f.ledger.recordResponse(scope,doc,2,attempt,metadata(Buffer.from('different'))));
  assert.equal((await f.ledger.recoverInterrupted(scope,doc,2,attempt,later)).status,'uncertain');assert.equal(f.read(path+'/events/3').unverifiedEvidenceDigest,sha(raw));assert.equal(f.read(receiptPath+'/artifacts/response').chunkCount,2);assert.deepEqual((await f.ledger.readResponse(scope,doc,2,attempt)).bytes,raw);assert.equal(f.calls(),0);
  await assert.rejects(f.ledger.recoverInterrupted(scope,doc,2,attempt,later));await assert.rejects(f.ledger.readAccepted(scope,doc));
});
test('late receipt can be preserved after recovery but cannot alter the recovered version',async()=>{
  const f=fixture();await f.prepare();await f.ledger.claim(scope,doc,1,attempt,at);await f.ledger.recoverInterrupted(scope,doc,2,attempt,later);
  await f.ledger.recordResponse(scope,doc,2,attempt,metadata(accepted,later));assert.deepEqual((await f.ledger.readResponse(scope,doc,2,attempt)).bytes,accepted);
  await assert.rejects(f.ledger.transition(scope,doc,2,{kind:'cleared',attemptId:attempt,at:later,resultDigest:sha(accepted),clearedArtifactDigest:sha(cleared),warnings:false},accepted,cleared),/Stale fiscal version/);assert.equal(f.read(path).status,'uncertain');
});
test('terminal transition requires the stored raw response; tamper and cross-scope reads fail',async()=>{
  const f=fixture();await f.prepare();await f.ledger.claim(scope,doc,1,attempt,at);const final={kind:'cleared',attemptId:attempt,at,resultDigest:sha(accepted),clearedArtifactDigest:sha(cleared),warnings:false};await assert.rejects(f.ledger.transition(scope,doc,2,final,accepted,cleared),/RECEIPT_REQUIRED/);
  await f.ledger.recordResponse(scope,doc,2,attempt,metadata(accepted));await assert.rejects(f.ledger.transition(scope,doc,2,final,Buffer.from('changed'),cleared),/RECEIPT_MISMATCH/);
  await assert.rejects(f.ledger.readResponse({...scope,egsId:'wrong'},doc,2,attempt));await assert.rejects(f.ledger.readResponse({...scope,environment:'production'},doc,2,attempt));
  f.seed(receiptPath+'/artifacts/response',{sha256:sha(accepted),bytes:Buffer.from('changed').toString('base64')});await assert.rejects(f.ledger.recoverInterrupted(scope,doc,2,attempt,later));assert.equal(f.read(path).status,'submitting');
});
test('transport enforces bounded deadline even if mock ignores AbortSignal',async()=>{
  let calls=0;const client=createZatcaSimulationClient({environment:'simulation',authorizedScope:scope,timeoutMs:100,fetchImpl:async()=>{calls++;return new Promise(()=>{});}});await assert.rejects(client.submit(credential,payload,'clearance'),/ZATCA_TRANSPORT_UNCERTAIN/);assert.equal(calls,1);
});
