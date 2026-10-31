import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync}from 'node:fs';
import {join}from 'node:path';
import {tmpdir}from 'node:os';
import {fileURLToPath}from 'node:url';
import {spawnSync}from 'node:child_process';
import {assessR07VGroqOperatorEvidence,R07V_GROQ_LIVE_PROBE_ACTIVE}
  from '../../dist/src/ai-next/router/groq-synthetic-readiness.js';

const NOW='2026-10-31T12:00:00Z';
const evidence=(override={})=>({
  schemaVersion:1,kind:'r07v_groq_operator_console_v1',
  provider:'groq',observedAt:'2026-10-31T11:30:00Z',
  plan:'free',modelId:'openai/gpt-oss-20b',
  organizationZdr:'enabled',optionalRetentionFeatures:'disabled',
  modelListed:'confirmed',modelAvailableOnFreePlan:'confirmed',
  jsonSchemaSupport:'confirmed',rpm:10,rpd:100,tpm:1000,
  explicitNoBillableUsage:'confirmed',
  syntheticOnly:true,evidenceType:'self_reported_unverified',...override,
});
const path=fileURLToPath(new URL(
  '../../scripts/ai-next-groq-readiness.mjs',import.meta.url));
const run=(args,contents)=>{
  const dir=mkdtempSync(join(tmpdir(),'r07v-offline-'));
  try{
    const file=join(dir,'operator.json');
    if(contents!==undefined)writeFileSync(file,contents);
    return spawnSync(process.execPath,[path,...args.map(x=>x==='FILE'?file:x)],
      {encoding:'utf8',timeout:5000});
  }finally{rmSync(dir,{force:true,recursive:true});}
};

test('R07V is permanently inactive without server-owned independent approval',()=>{
  assert.equal(R07V_GROQ_LIVE_PROBE_ACTIVE,false);
  const ready=assessR07VGroqOperatorEvidence(evidence(),NOW);
  assert.equal(ready.status,'pending_independent_account_review');
  assert.deepEqual(ready.reasons,[]);
  assert.equal(ready.syntheticTestOnly,true);
  assert.equal(ready.suggestedMaxRequests,2);
  for(const key of ['canInvokeProvider','canAccessRealBusinessData',
    'canChangeProduction','accountIdentityVerified',
    'accountFreeVerified','perModelPriceVerified','privacyApprovalVerified'])
    assert.equal(ready[key],false,key);
  assert.ok(!JSON.stringify(ready).includes('client'));
});

test('unknown/paid plan, missing ZDR, potential billing and zero quota all block',()=>{
  const v=assessR07VGroqOperatorEvidence(evidence({
    plan:'developer',organizationZdr:'unknown',
    optionalRetentionFeatures:'enabled',modelListed:'not_confirmed',
    modelAvailableOnFreePlan:'unknown',jsonSchemaSupport:'unknown',
    rpm:0,rpd:0,tpm:0,explicitNoBillableUsage:'not_confirmed',
  }),NOW);
  assert.equal(v.status,'blocked');
  assert.deepEqual(v.reasons,[
    'FREE_PLAN_UNCONFIRMED','MODEL_UNAVAILABLE_OR_NOT_FREE',
    'MODEL_JSON_SCHEMA_UNCONFIRMED','ORG_RATE_LIMIT_UNCONFIRMED',
    'ZERO_BILLING_UNCONFIRMED','ZDR_NOT_ENABLED',
    'RETENTION_FEATURES_UNCONFIRMED',
  ]);
  assert.equal(v.canInvokeProvider,false);
});

test('account observations expire in 24h; future clock can never authorize',()=>{
  assert.deepEqual(assessR07VGroqOperatorEvidence(evidence({
    observedAt:'2026-10-30T11:59:59Z',
  }),NOW).reasons,['STALE_CONSOLE_REVIEW']);
  assert.deepEqual(assessR07VGroqOperatorEvidence(evidence({
    observedAt:'2026-10-31T12:00:01Z',
  }),NOW).reasons,['STALE_CONSOLE_REVIEW']);
});

test('no credentials, account identifiers, forged approvals or extra fields accepted',()=>{
  for(const extra of [
    {apiKey:'gsk_private'},
    {accessToken:'secret'},
    {organizationId:'private-org'},
    {privacyApproved:true},
    {accountFreeVerified:true},
    {modelZeroCostVerified:true},
    {canInvokeProvider:true},
    {requestedRealCustomerData:true},
    {billingCard:'fake'},
    {groqConsoleUrl:'https://attacker.invalid'},
    {syntheticOnly:false},
    {evidenceType:'verified_by_chatgpt'},
    {rpm:'30'}, {modelId:'model;post invoice'},
    {observedAt:'2026-02-30T00:00:00Z'},
  ])assert.throws(()=>assessR07VGroqOperatorEvidence(evidence(extra),NOW),
    /R07V_INVALID_OPERATOR_EVIDENCE/);
  for(const raw of [null,undefined,[],42,'key',{}])
    assert.throws(()=>assessR07VGroqOperatorEvidence(raw,NOW),
      /R07V_INVALID_OPERATOR_EVIDENCE/);
});

test('CLI emits only sanitised review, cannot load environment or invoke a model',()=>{
  const template=run(['template']);
  assert.equal(template.status,0,template.stderr);
  const parsed=JSON.parse(template.stdout);
  assert.equal(parsed.plan,'unknown');
  assert.equal(parsed.organizationZdr,'unknown');
  assert.equal(parsed.syntheticOnly,true);
  assert.ok(!template.stdout.includes('gsk_'));
  const output=run(['review','FILE'],JSON.stringify(parsed));
  assert.equal(output.status,0,output.stderr);
  const review=JSON.parse(output.stdout);
  assert.equal(review.status,'blocked');
  assert.equal(review.canInvokeProvider,false);
  assert.equal(review.accountFreeVerified,false);
  const bad=run(['review','FILE'],
    JSON.stringify({...parsed,apiKey:'gsk_should_not_leak'}));
  assert.notEqual(bad.status,0);
  assert.equal(bad.stderr.trim(),'R07V_INVALID_OPERATOR_EVIDENCE');
  assert.ok(!bad.stdout.includes('gsk_should_not_leak'));
  const garbage=run(['review','FILE'],'{ not json nor credentials }');
  assert.notEqual(garbage.status,0);
  assert.equal(garbage.stderr.trim(),'R07V_INVALID_OPERATOR_EVIDENCE');
});
