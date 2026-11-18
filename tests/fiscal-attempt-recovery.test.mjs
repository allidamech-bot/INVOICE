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
  rows.set(base,{accountUid:scope.accountUid,workspaceId:scope.workspaceId,environment:'simulation',syntheticOnly:true});
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

import {createFiscalReconciler} from '../api/_fiscal/reconciliation.js';
function reconciler(f,patch={}){
  return createFiscalReconciler({ledger:f.ledger,resolveCredential:async()=>credential,verifyPrepared:async({xml:x,snapshot:s})=>x.equals(xml)&&s.equals(snapshot),verifyAuthorityResult:async()=>true,clock:()=>later,...patch});
}
async function hold(f,raw,status=200,late=false){
  await f.prepare();await f.ledger.claim(scope,doc,1,attempt,at);
  if(raw&&!late)await f.ledger.recordResponse(scope,doc,2,attempt,{...metadata(raw),httpStatus:status});
  await f.ledger.recoverInterrupted(scope,doc,2,attempt,later);
  if(raw&&late)await f.ledger.recordResponse(scope,doc,2,attempt,{...metadata(raw,later),httpStatus:status});
}
test('late clearance receipt is reconciled against original without another submission',async()=>{
  const f=fixture();await hold(f,accepted,200,true);assert.deepEqual(await reconciler(f)(scope,doc,3),{documentId:doc,status:'cleared',version:4});
  assert.equal(f.calls(),0);assert.equal(f.read(path+'/events/3').status,'uncertain');assert.equal(f.read(path+'/events/4').resultDigest,sha(accepted));assert.deepEqual((await f.ledger.readAccepted(scope,doc)).xml,cleared);
});
test('reporting warning recovered; only one competing verifier can commit',async()=>{
  const raw=Buffer.from(JSON.stringify({reportingStatus:'REPORTED',validationResults:{status:'WARNING',errorMessages:[],warningMessages:[{}]}}));const f=fixture({mode:'reporting'});await hold(f,raw,202);
  const reconcile=reconciler(f);const results=await Promise.allSettled([reconcile(scope,doc,3),reconcile(scope,doc,3)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.read(path).status,'reported');assert.equal(f.read(path).warnings,true);assert.deepEqual((await f.ledger.readAccepted(scope,doc)).xml,xml);assert.equal(f.calls(),0);
});
test('missing, malformed and non-success receipts stay held without invoking verifiers',async()=>{
  for(const [raw,status] of [[null,200],[Buffer.from('malformed'),200],[accepted,400],[accepted,303]]){const f=fixture();await hold(f,raw,status);let checks=0;const r=reconciler(f,{verifyPrepared:async()=>{checks++;return true;}});assert.equal((await r(scope,doc,3)).status,'uncertain');assert.equal(checks,0);assert.equal(f.calls(),0);}
});
test('verification failure stays held; recovery cannot accept a receipt with a forged artifact',async()=>{
  const f=fixture();await hold(f,accepted);for(const patch of [{verifyPrepared:async()=>false},{verifyAuthorityResult:async()=>false},{resolveCredential:async()=>{throw Error('unavailable');}}])assert.equal((await reconciler(f,patch)(scope,doc,3)).status,'uncertain');
  const other=Buffer.from('<other/>');await assert.rejects(f.ledger.transition(scope,doc,3,{kind:'cleared',attemptId:attempt,at:later,resultDigest:sha(accepted),clearedArtifactDigest:sha(other),warnings:false},accepted,other),/NOT_ACCEPTED/);assert.equal(f.read(path).status,'uncertain');
});
test('scope and immutable artifact integrity rechecked at final CAS; no negative decision without evidence integration',async()=>{
  const f=fixture();await hold(f,accepted);await assert.rejects(reconciler(f)({...scope,egsId:'other'},doc,3));await assert.rejects(reconciler(f)({...scope,environment:'production'},doc,3));
  await assert.rejects(f.ledger.transition(scope,doc,3,{kind:'confirmed-not-accepted',attemptId:attempt,at:later,evidenceDigest:sha(accepted)},accepted),/NEGATIVE_RECONCILIATION_NOT_CONFIGURED/);
  await assert.rejects(reconciler(f,{verifyAuthorityResult:async()=>{f.seed(path+'/artifacts/prepared',{sha256:sha(xml),bytes:Buffer.from('changed').toString('base64')});return true;}})(scope,doc,3),/artifact/);assert.equal(f.read(path).status,'uncertain');
});
