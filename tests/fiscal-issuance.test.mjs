import test from 'node:test';
import assert from 'node:assert/strict';
import {FIRST_PREVIOUS_INVOICE_HASH,prepareFiscalIssue,transitionFiscalIssue,fiscalDeliveryArtifact,fiscalReportingOverdue} from '../dist/src/lib/fiscal-issuance.js';
const at='2026-11-18T10:00:00.000Z', later='2026-11-18T10:01:00.000Z';
const dig='a'.repeat(64), result='b'.repeat(64), cleared='c'.repeat(64), hash=Buffer.alloc(32,1).toString('base64');
const input={accountUid:'test-owner',workspaceId:'test-company',egsId:'test-egs',documentId:'test-doc',uuid:'11111111-1111-4111-8111-111111111111',icv:'1',previousInvoiceHash:FIRST_PREVIOUS_INVOICE_HASH,invoiceHash:hash,artifactDigest:dig,snapshotDigest:dig,generatedAt:at,mode:'clearance'};
const init=(mode='clearance')=>prepareFiscalIssue({...input,mode});
const move=(r,kind,extra={})=>transitionFiscalIssue(r,r.version,{kind,attemptId:'attempt-1',at:later,...extra});
const start=r=>move(r,'start');
test('clearance never exposes an uncleared artifact',()=>{
  const q=init(), s=start(q), u=move(s,'uncertain');
  for(const r of [q,s,u,move(s,'rejected',{resultDigest:result}),move(u,'confirmed-not-accepted',{evidenceDigest:result})]) assert.equal(fiscalDeliveryArtifact(r),null);
  const c=move(u,'cleared',{resultDigest:result,clearedArtifactDigest:cleared,warnings:true});
  assert.equal(c.status,'cleared');assert.equal(c.warnings,true);assert.equal(fiscalDeliveryArtifact(c),cleared);
});
test('reporting keeps signed artifact and fixed 24-hour deadline',()=>{
  const q=init('reporting');assert.equal(q.reportingDeadline,'2026-11-19T10:00:00.000Z');assert.equal(fiscalDeliveryArtifact(q),dig);
  const u=move(start(q),'uncertain');assert.equal(fiscalDeliveryArtifact(u),dig);
  assert.equal(fiscalReportingOverdue(u,'2026-11-19T09:59:59.999Z'),false);
  assert.equal(fiscalReportingOverdue(u,q.reportingDeadline),true);
  const r=move(u,'reported',{resultDigest:result,warnings:false});assert.equal(fiscalReportingOverdue(r,q.reportingDeadline),false);
  assert.equal(fiscalDeliveryArtifact(r),dig);assert.equal(r.reportingDeadline,q.reportingDeadline);
});
test('uncertainty blocks retry until independently confirmed non-acceptance',()=>{
  const u=move(start(init()),'uncertain');assert.throws(()=>move(u,'start',{attemptId:'attempt-2'}));
  const r=move(u,'confirmed-not-accepted',{evidenceDigest:result});assert.throws(()=>start(r));
  const s=move(r,'start',{attemptId:'attempt-2'});assert.equal(s.attemptCount,2);assert.throws(()=>move(s,'cleared',{resultDigest:result,clearedArtifactDigest:cleared,warnings:false}));
  const c=move(s,'cleared',{attemptId:'attempt-2',resultDigest:result,clearedArtifactDigest:cleared,warnings:false});assert.equal(c.status,'cleared');
});
test('stale versions, timestamps, invalid digests and mismatched authority outcomes fail closed',()=>{
  const s=start(init());
  assert.throws(()=>transitionFiscalIssue(s,1,{kind:'uncertain',attemptId:'attempt-1',at:later}));
  assert.throws(()=>move(s,'uncertain',{at}));
  assert.throws(()=>move(s,'reported',{resultDigest:result,warnings:false}));
  assert.throws(()=>move(start(init('reporting')),'cleared',{resultDigest:result,clearedArtifactDigest:cleared,warnings:false}));
  assert.throws(()=>move(s,'confirmed-not-accepted',{evidenceDigest:'timeout'}));
  assert.throws(()=>move(s,'cleared',{resultDigest:result,clearedArtifactDigest:'not-a-digest',warnings:false}));
  assert.throws(()=>move(s,'unknown'));
});
test('terminal results are immutable; rejected reporting blocks re-delivery',()=>{
  const r=move(start(init('reporting')),'rejected',{resultDigest:result});
  assert.equal(fiscalDeliveryArtifact(r),null);assert.throws(()=>move(r,'start',{attemptId:'attempt-2'}));assert.throws(()=>move(r,'reported',{resultDigest:result,warnings:false}));
  assert.equal(r.artifactDigest,dig);
});
test('preparation rejects malformed fields and ignores caller-supplied state',()=>{
  for(const patch of [{icv:'0'},{previousInvoiceHash:hash},{icv:'2'},{uuid:'invalid'},{invoiceHash:'not-a-hash'},{artifactDigest:'x'},{accountUid:'../bad'},{generatedAt:'2026-02-30T10:00:00.000Z'},{mode:'commercial'}]) assert.throws(()=>prepareFiscalIssue({...input,...patch}));
  const q=prepareFiscalIssue({...input,status:'cleared',version:999,clearedArtifactDigest:cleared});assert.equal(q.status,'queued');assert.equal(q.version,1);assert.equal(q.clearedArtifactDigest,null);
});
test('transitions preserve fiscal identity and prior records',()=>{
  const q=init();Object.freeze(q);Object.freeze(q.usedAttemptIds);
  const s=start(q);for(const k of Object.keys(input)) assert.equal(s[k],q[k]);assert.equal(q.status,'queued');assert.deepEqual(q.usedAttemptIds,[]);
});

test('first invoice uses prescribed genesis hash; subsequent invoices use SHA-256 base64',()=>{
  assert.equal(prepareFiscalIssue(input).previousInvoiceHash,FIRST_PREVIOUS_INVOICE_HASH);
  assert.equal(prepareFiscalIssue({...input,icv:'2',previousInvoiceHash:hash}).previousInvoiceHash,hash);
});
