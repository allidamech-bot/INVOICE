import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFinanceAcceptanceEvidence as validate} from '../scripts/finance-alif-acceptance-evidence.mjs';

const sha=n=>n.toString(16).padStart(64,'0');
const commit='a'.repeat(40),when='2026-10-27T10:00:00.000Z';
const names=['financeCycle','twoDevice','publishedRules','crossUid','physicalIphone','authorityRecovery','costPolicy'];
function fullHypotheticalEvidence(){
 const gates=Object.fromEntries(names.map((name,i)=>[name,{
   result:'passed',proofSha256:sha(i+1),reviewer:'synthetic-reviewer',
   reviewedAt:when
 }]));
 Object.assign(gates.financeCycle,{
  purchase200Stock200:true,finalInvoice20Stock180:true,noSecondStockIssue:true,
  arPaid50Outstanding150:true,apPaid30Outstanding1170:true,bankOpening100Closing120:true
 });
 Object.assign(gates.twoDevice,{
  independentSessions:true,noDuplicateBankAllocation:true,
  staleEditRejected:true,finalBalancesMatch:true
 });
 Object.assign(gates.publishedRules,{
  project:'lourex-invoice',
  releaseName:'projects/lourex-invoice/releases/cloud.firestore',
  rulesetName:'projects/lourex-invoice/rulesets/synthetic123',
  publishedSha256:sha(9),repositorySha256:sha(9),
  publishedAt:'2026-10-27T09:57:00Z',
  checkoutCommitSha:commit,releaseRecheckMatched:true,
  differenceStatus:'BYTE_IDENTICAL_SECURITY_REVIEW_REQUIRED',
  rulesetCreatedAt:'2026-10-27T09:56:00Z',
  releaseUpdatedAt:'2026-10-27T09:57:00Z',
  capturedAtUtc:'2026-10-27T09:59:00Z'
 });
 Object.assign(gates.crossUid,{
  twoAuthenticatedQaUsers:true,ownerReadAndWrite:true,
  crossUidReadDenied:true,crossUidWriteDenied:true
 });
 Object.assign(gates.physicalIphone,{
  realSafariDevice:true,sameSavedAndPreviewPdf:true,rtlMultiPagePdf:true,
  shareSheetOrPrint:true,keyboardPwa:true
 });
 Object.assign(gates.authorityRecovery,{
  operatorApproved:true,restoredServerAuthority:true,reportHashesVerified:true,
  approvedRpoMinutes:30,approvedRtoMinutes:120
 });
 Object.assign(gates.costPolicy,{
  method:'PERPETUAL_WEIGHTED_AVERAGE',returnsAndFxApproved:true,
  policyVersion:'SYNTHETIC-NOT-APPROVED'
 });
 return{
  schema:'LOUREX_ALIF_FINANCE_EVIDENCE_V1',checkpointUtc:when,
  release:{githubMainSha:commit,productionSha:commit,productionState:'READY'},
  gates,signoff:Object.fromEntries(['finance','security','release'].map(role=>[
    role,{reviewer:'synthetic-'+role+'-reviewer',reviewedAt:when}
  ]))
 };
}

test('missing or partial proof is NO-GO and never silently accepted',()=>{
 for(const input of [null,{},fullHypotheticalEvidence()] .slice(0,2)){
   const result=validate(input);
   assert.equal(result.status,'NO_GO_EVIDENCE_INCOMPLETE');
   assert.ok(result.missing.length>5);
   assert.equal(result.checkedGateCount,7);
 }
 const partial=fullHypotheticalEvidence();
 delete partial.gates.crossUid.crossUidWriteDenied;
 assert.equal(validate(partial).status,'NO_GO_EVIDENCE_INCOMPLETE');
 assert.ok(validate(partial).missing.includes('gates.crossUid.crossUidWriteDenied'));
});

test('even a complete SYNTHETIC dossier never produces automatic production GO',()=>{
 const result=validate(fullHypotheticalEvidence());
 assert.deepEqual(result.missing,[],'Synthetic complete dossier missing unexpected fields');
 assert.equal(result.status,'READY_FOR_INDEPENDENT_HUMAN_REVIEW_ONLY');
 assert.doesNotMatch(result.status,/^GO$/);
 assert.match(result.note,/No live verification/);
});

test('a stale or non-READY production SHA cannot masquerade as reviewed release',()=>{
 const a=fullHypotheticalEvidence();a.release.productionSha='b'.repeat(40);
 const b=fullHypotheticalEvidence();b.release.productionState='BUILDING';
 assert.ok(validate(a).missing.includes('release.shaEquality'));
 assert.ok(validate(b).missing.includes('release.productionState'));
});

test('published Firebase rule provenance requires matching actual rules hash and release metadata',()=>{
 const a=fullHypotheticalEvidence();a.gates.publishedRules.repositorySha256=sha(10);
 const b=fullHypotheticalEvidence();b.gates.publishedRules.publishedAt='not-a-time';
 const c=fullHypotheticalEvidence();c.gates.publishedRules.rulesetName='projects/evil/rulesets/a';
 assert.ok(validate(a).missing.includes('gates.publishedRules.sourceMatches'));
 assert.ok(validate(b).missing.includes('gates.publishedRules.publishedAt'));
 assert.ok(validate(c).missing.includes('gates.publishedRules.rulesetName'));
});

test('a fake iPhone, missing live QA or unapproved recovery blocks readiness',()=>{
 const a=fullHypotheticalEvidence();a.gates.physicalIphone.realSafariDevice=false;
 const b=fullHypotheticalEvidence();b.gates.financeCycle.finalInvoice20Stock180=false;
 const c=fullHypotheticalEvidence();c.gates.authorityRecovery.approvedRpoMinutes=-1;
 const d=fullHypotheticalEvidence();d.gates.costPolicy.returnsAndFxApproved=false;
 assert.ok(validate(a).missing.includes('gates.physicalIphone.realSafariDevice'));
 assert.ok(validate(b).missing.includes('gates.financeCycle.finalInvoice20Stock180'));
 assert.ok(validate(c).missing.includes('gates.authorityRecovery.approvedRpoMinutes'));
 assert.ok(validate(d).missing.includes('gates.costPolicy.returnsAndFxApproved'));
});

test('duplicate proofs or missing independent signoff blocks review readiness',()=>{
 const a=fullHypotheticalEvidence();
 a.gates.twoDevice.proofSha256=a.gates.financeCycle.proofSha256;
 const b=fullHypotheticalEvidence();b.signoff.security.reviewer='pending';
 assert.ok(validate(a).missing.includes('gates.distinctProofHashes'));
 assert.ok(validate(b).missing.includes('signoff.security.reviewer'));
});

test('validation reports field paths only and never echoes private dossier contents',()=>{
 const a=fullHypotheticalEvidence();
 a.gates.financeCycle.reviewer='private-person@internal.invalid';
 a.gates.crossUid.secretToken='should-never-be-printed';
 a.signoff.finance.reviewer='private-finance-person';
 a.gates.crossUid.crossUidWriteDenied=false;
 const printed=JSON.stringify(validate(a));
 assert.doesNotMatch(printed,/private-person|should-never-be-printed|private-finance-person/);
 assert.match(printed,/gates.crossUid.crossUidWriteDenied/);
});

test('only the approved moving weighted-average default meets cost-policy evidence completeness',()=>{
 const approvedDefault=fullHypotheticalEvidence();
 assert.equal(validate(approvedDefault).status,'READY_FOR_INDEPENDENT_HUMAN_REVIEW_ONLY');
 for(const method of ['FIFO','PERIODIC_WEIGHTED_AVERAGE','SPECIFIC_IDENTIFICATION',null]){
  const dossier=fullHypotheticalEvidence();dossier.gates.costPolicy.method=method;
  const result=validate(dossier);
  assert.equal(result.status,'NO_GO_EVIDENCE_INCOMPLETE');
  assert.ok(result.missing.includes('gates.costPolicy.method'));
 }
});

test('35-B provenance must be stable and bound to the exact reviewed checkout',()=>{
 const unbound=fullHypotheticalEvidence();
 unbound.gates.publishedRules.checkoutCommitSha='b'.repeat(40);
 assert.ok(validate(unbound).missing.includes('gates.publishedRules.checkoutCommitSha'));

 const changed=fullHypotheticalEvidence();
 changed.gates.publishedRules.releaseRecheckMatched=false;
 assert.ok(validate(changed).missing.includes('gates.publishedRules.releaseRecheckMatched'));

 const mismatch=fullHypotheticalEvidence();
 mismatch.gates.publishedRules.differenceStatus='SOURCE_DIFFERENT_RISK_NOT_ASSESSED';
 assert.ok(validate(mismatch).missing.includes('gates.publishedRules.differenceStatus'));

 const outOfOrder=fullHypotheticalEvidence();
 outOfOrder.gates.publishedRules.capturedAtUtc='2026-10-27T08:00:00Z';
 assert.ok(validate(outOfOrder).missing.includes('gates.publishedRules.chronology'));

 const reviewerBeforeCapture=fullHypotheticalEvidence();
 reviewerBeforeCapture.gates.publishedRules.reviewedAt='2026-10-27T08:00:00Z';
 assert.ok(validate(reviewerBeforeCapture).missing.includes('gates.publishedRules.chronology'));

 const noCapture=fullHypotheticalEvidence();
 delete noCapture.gates.publishedRules.capturedAtUtc;
 assert.ok(validate(noCapture).missing.includes('gates.publishedRules.capturedAtUtc'));
 assert.ok(validate(noCapture).missing.includes('gates.publishedRules.chronology'));
});

test('complete synthetic provenance still only reaches independent human review',()=>{
 const example=fullHypotheticalEvidence();
 assert.equal(validate(example).status,'READY_FOR_INDEPENDENT_HUMAN_REVIEW_ONLY');
 assert.doesNotMatch(JSON.stringify(validate(example)),/\bGO_APPROVED\b/);
});
