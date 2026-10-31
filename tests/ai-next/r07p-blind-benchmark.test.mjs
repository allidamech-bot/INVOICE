/**
 * Strict external benchmarking protocol, no actual model calls. Every candidate
 * here is a synthetic fixture; passing tests is NOT model accuracy evidence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {makeR07PBlindPromptSet,scoreR07PBenchmarkCapture}
  from '../../dist/src/ai-next/router/semantic-benchmark.js';

const bytes=readFileSync(new URL(
  './r07p-semantic-evaluation-gold.json',import.meta.url));
const gold=JSON.parse(bytes.toString('utf8')).cases;
const sha=createHash('sha256').update(bytes).digest('hex');
const script=fileURLToPath(new URL(
  '../../scripts/ai-next-semantic-benchmark.mjs',import.meta.url));
const observations=()=>gold.map(c=>({
  caseId:c.id,outcome:'not_attempted',latencyMs:0,
}));
const captured=(o=observations())=>({
  schemaVersion:1,kind:'r07p_provider_capture_v1',
  corpusSha256:sha,providerId:'synthetic-test-provider',
  modelId:'synthetic-test-model',runId:'synthetic-test-run',observations:o,
});
const invoke=(args,body)=>{
  const dir=mkdtempSync(join(tmpdir(),'r07p-bench-'));
  try{
    const file=join(dir,'capture.json');
    if(body!==undefined)writeFileSync(file,JSON.stringify(body));
    return spawnSync(process.execPath,[script,...args.map(x=>x==='FILE'?file:x)],
      {encoding:'utf8',timeout:10_000});
  }finally{rmSync(dir,{force:true,recursive:true});}
};

test('blind prompt export contains all 43 synthetic questions, but NO gold expected answers',()=>{
  const blind=makeR07PBlindPromptSet(gold,sha);
  assert.equal(blind.prompts.length,43);
  assert.equal(blind.corpusSha256,sha);
  assert.equal(blind.containsExpectedLabels,false);
  assert.deepEqual(new Set(blind.prompts.map(c=>c.caseId)).size,43);
  for(const row of blind.prompts){
    assert.deepEqual(Object.keys(row).sort(),['caseId','language','utterance']);
    assert.equal(row.utterance,gold.find(c=>c.id===row.caseId).utterance);
  }
  assert.ok(!JSON.stringify(blind).includes('"expected":'));
  const cli=invoke(['export']);
  assert.equal(cli.status,0,cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout),blind);
  assert.ok(!cli.stdout.includes('"facts":'));
});

test('all 43 explicit skips are NOT a model evaluation or 100% accuracy',()=>{
  const report=scoreR07PBenchmarkCapture(gold,captured(),sha);
  assert.equal(report.totalCases,43);
  assert.equal(report.attempted,0);
  assert.equal(report.responses,0);
  assert.equal(report.outcomes.not_attempted,43);
  assert.equal(report.latencyMs.attemptedP95,null);
  assert.equal(report.semantic.overall.coverage,0);
  assert.equal(report.semantic.overall.fullExactMatch,0);
  assert.equal(report.provenanceVerified,false);
  assert.equal(report.accountFreeVerified,false);
  assert.equal(report.privacyPermissionVerified,false);
  assert.equal(report.productionAcceptance,'not_assessed');
});

test('rejections, failures and invalid output remain in 43-case denominator and latency',()=>{
  const o=observations();
  const successful=(id,modelCandidate,latencyMs)=>{
    const index=o.findIndex(c=>c.caseId===id);
    o[index]={caseId:id,outcome:'ok',latencyMs,candidate:modelCandidate};
  };
  successful('ar-customer-01',structuredClone(
    gold.find(c=>c.id==='ar-customer-01').expected),300);
  successful('en-preview-01',{
    action:'execute_approved',reference:'none',subject:null,facts:[],
    missingFields:[],sourceIds:[],
  },900);
  successful('mix-price-01',{action:'edit_draft',extra:'oracle'},2200);
  const i=o.findIndex(c=>c.caseId==='ar-quantity-01');
  o[i]={caseId:'ar-quantity-01',outcome:'timeout',latencyMs:12000};
  const j=o.findIndex(c=>c.caseId==='en-quantity-01');
  o[j]={caseId:'en-quantity-01',outcome:'rate_limited',latencyMs:5000};
  const report=scoreR07PBenchmarkCapture(gold,captured(o),sha);
  assert.equal(report.attempted,5);
  assert.equal(report.responses,3);
  assert.equal(report.outcomes.ok,3);
  assert.equal(report.outcomes.timeout,1);
  assert.equal(report.outcomes.rate_limited,1);
  assert.equal(report.outcomes.not_attempted,38);
  assert.equal(report.latencyMs.attemptedP50,2200);
  assert.equal(report.latencyMs.attemptedP95,12000);
  assert.equal(report.semantic.overall.valid,2);
  assert.equal(report.semantic.overall.unexpectedFinancialExecutionIntents,1);
  assert.equal(report.semantic.byLanguage.mixed.valid,0);
  assert.equal(report.semantic.overall.total,43);
  assert.equal(report.productionAcceptance,'not_assessed');
  const cli=invoke(['score','FILE'],captured(o));
  assert.equal(cli.status,0,cli.stderr);
  assert.equal(JSON.parse(cli.stdout).attempted,5);
  assert.ok(!cli.stdout.includes('شركة النور'));
});

test('cross-corpus, unknown, missing, duplicate or extra oracle fields fail closed',()=>{
  const base=captured();
  const assertBad=(c,code)=>assert.match(invoke(['score','FILE'],c).stderr,
    new RegExp(code));
  assertBad({...base,corpusSha256:'a'.repeat(64)},
    'R07P_BENCH_INVALID_CAPTURE');
  assertBad({...base,expected:gold[0].expected},'R07P_BENCH_INVALID_CAPTURE');
  assertBad({...base,observations:base.observations.slice(1)},
    'R07P_BENCH_INCOMPLETE_CAPTURE');
  assertBad({...base,observations:[
    {...base.observations[0],caseId:'foreign-case'},...base.observations.slice(1),
  ]},'R07P_BENCH_INVALID_OBSERVATION');
  assertBad({...base,observations:[
    base.observations[0],base.observations[0],...base.observations.slice(2),
  ]},'R07P_BENCH_INVALID_OBSERVATION');
  assertBad({...base,observations:[
    {...base.observations[0],expected:gold[0].expected},
    ...base.observations.slice(1),
  ]},'R07P_BENCH_INVALID_OBSERVATION');
});

test('impossible success, skips with latency and forged provider claims are rejected',()=>{
  const base=captured();
  const mutated=change=>{
    const obs=observations();
    obs[0]={...obs[0],...change};
    return captured(obs);
  };
  assert.match(invoke(['score','FILE'],mutated({
    outcome:'ok',latencyMs:50,
  })).stderr,/R07P_BENCH_INVALID_OBSERVATION/);
  assert.match(invoke(['score','FILE'],mutated({
    outcome:'not_attempted',latencyMs:100,
  })).stderr,/R07P_BENCH_INVALID_OBSERVATION/);
  assert.match(invoke(['score','FILE'],mutated({
    outcome:'timeout',latencyMs:50001,
  })).stderr,/R07P_BENCH_INVALID_OBSERVATION/);
  assert.match(invoke(['score','FILE'],{
    ...base,accountFreeVerified:true,privacyApproved:true,
  }).stderr,/R07P_BENCH_INVALID_CAPTURE/);
});
