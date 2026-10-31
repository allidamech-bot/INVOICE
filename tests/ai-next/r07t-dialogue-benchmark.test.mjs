/**
 * R07T blind synthetic multi-turn scoring. No inference, real customer
 * information, credentials, financial writes, providers or release claims.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {makeR07TBlindDialogueSet,scoreR07TDialogueCapture}
  from '../../dist/src/ai-next/router/semantic-dialogue-benchmark.js';

const bytes=readFileSync(new URL('./r07t-dialogue-gold.json',import.meta.url));
const cases=JSON.parse(bytes.toString('utf8')).scenarios;
const sha=createHash('sha256').update(bytes).digest('hex');
const script=fileURLToPath(new URL(
  '../../scripts/ai-next-semantic-dialogue.mjs',import.meta.url));
const allTurns=cases.flatMap(s=>s.turns.map(t=>({
  scenarioId:s.scenarioId,turnId:t.turnId,
})));
const capture=(obs=allTurns.map(x=>({...x,outcome:'not_attempted',latencyMs:0})))=>({
  schemaVersion:1,kind:'r07t_dialogue_capture_v1',
  corpusSha256:sha,runId:'test-synthetic-run',observations:obs,
});
const invoke=(args,body)=>{
  const dir=mkdtempSync(join(tmpdir(),'r07t-dialogue-'));
  try{
    const path=join(dir,'capture.json');
    if(body!==undefined)writeFileSync(path,JSON.stringify(body));
    return spawnSync(process.execPath,[script,...args.map(a=>a==='FILE'?path:a)],
      {encoding:'utf8',timeout:10_000});
  }finally{rmSync(dir,{recursive:true,force:true});}
};

test('blind export has all conversation history but no expected structured answers',()=>{
  assert.equal(cases.length,9);
  assert.equal(allTurns.length,27);
  for(const language of ['ar','en','mixed'])
    assert.equal(cases.filter(x=>x.language===language).length,3);
  for(const s of cases){
    assert.equal(s.turns.length,3);
    for(let i=0;i<s.turns.length;i++){
      const turn=s.turns[i];
      assert.equal(turn.history.length,2*i);
      if(i>0){
        assert.equal(turn.history.at(-2).role,'user');
        assert.equal(turn.history.at(-2).text,s.turns[i-1].message);
        assert.equal(turn.history.at(-1).role,'assistant');
      }
    }
  }
  const blind=makeR07TBlindDialogueSet(cases,sha);
  assert.equal(blind.scenarios.length,9);
  assert.equal(blind.containsExpectedLabels,false);
  for(const s of blind.scenarios)
    for(const t of s.turns)
      assert.deepEqual(Object.keys(t).sort(),['history','message','turnId']);
  const output=invoke(['export']);
  assert.equal(output.status,0,output.stderr);
  assert.deepEqual(JSON.parse(output.stdout),blind);
  assert.ok(!output.stdout.includes('"expected":'));
  assert.ok(!output.stdout.includes('"sourceIds":'));
});

test('zero captures do not magically establish model or conversation accuracy',()=>{
  const score=scoreR07TDialogueCapture(cases,capture(),sha);
  assert.equal(score.scenarios,9);
  assert.equal(score.totalTurns,27);
  assert.equal(score.attempted,0);
  assert.equal(score.dialogueFullyExact,0);
  assert.equal(score.dialogueFullyExactPercent,0);
  assert.equal(score.semantic.overall.coverage,0);
  assert.equal(score.semantic.overall.fullExactMatch,0);
  assert.equal(score.latencyMs.p95,null);
  assert.equal(score.modelOriginVerified,false);
  assert.equal(score.accountFreeVerified,false);
  assert.equal(score.privacyPermissionVerified,false);
  assert.equal(score.productionAcceptance,'not_assessed');
});

test('local-baseline CLI reports only actual deterministic coverage, no provider claims',()=>{
  const output=invoke(['baseline']);
  assert.equal(output.status,0,output.stderr);
  const report=JSON.parse(output.stdout);
  assert.equal(report.ruleBasedOnly,true);
  assert.equal(report.modelCalls,0);
  assert.equal(report.contextUsedForInference,false);
  assert.equal(report.totalTurns,27);
  assert.equal(report.semantic.overall.total,27);
  assert.ok(report.semantic.overall.provided>0);
  assert.ok(report.semantic.overall.provided<27,
    'never pass the context-dependent set by accidental answer leakage');
  assert.equal(report.dialogueFullyExactPercent<100,true);
  assert.equal(report.modelOriginVerified,false);
  assert.equal(report.productionAcceptance,'not_assessed');
  assert.equal(output.stdout.includes('Noor Trading'),false,
    'diagnostic must not print any test prompts or business-like names');
});

test('perfect HANDWRITTEN predictions pass all turns without provider attestation',()=>{
  const complete=cases.flatMap(s=>s.turns.map(t=>({
    scenarioId:s.scenarioId,turnId:t.turnId,outcome:'ok',latencyMs:50,
    candidate:t.expected,
  })));
  const score=scoreR07TDialogueCapture(cases,capture(complete),sha);
  assert.equal(score.dialogueFullyExact,9);
  assert.equal(score.dialogueFullyExactPercent,100);
  assert.equal(score.semantic.overall.fullExactMatch,100);
  assert.equal(score.modelOriginVerified,false,
    'even a 100% synthetic capture is NOT proof of model understanding');
  assert.equal(score.accountFreeVerified,false);
  assert.equal(score.productionAcceptance,'not_assessed');
});

test('one failure collapses dialogue pass, missing responses stay in denominator',()=>{
  const o=cases.flatMap(s=>s.turns.map(t=>({
    scenarioId:s.scenarioId,turnId:t.turnId,outcome:'ok',latencyMs:50,
    candidate:t.expected,
  })));
  const missing=o.find(x=>x.scenarioId==='ar_price_followup'&&
    x.turnId==='value');
  missing.outcome='timeout';
  missing.latencyMs=12_000;
  delete missing.candidate;
  const score=scoreR07TDialogueCapture(cases,capture(o),sha);
  assert.equal(score.attempted,27);
  assert.equal(score.observations.timeout,1);
  assert.equal(score.semantic.overall.provided,26);
  assert.equal(score.dialogueFullyExact,8);
  assert.deepEqual(score.failedScenarios,['ar_price_followup']);
  assert.equal(score.latencyMs.p95,50);
  assert.equal(score.latencyMs.p50,50);
  assert.equal(score.latencyMs.p95<score.latencyMs.p50,false);
  assert.equal(score.latencyMs.p95,50); // 26 x 50 + 1 x 12000
});

test('unsafe model-invented financial execution fails the individual and complete dialogue',()=>{
  const o=cases.flatMap(s=>s.turns.map(t=>({
    scenarioId:s.scenarioId,turnId:t.turnId,outcome:'ok',latencyMs:100,
    candidate:t.expected,
  })));
  const unsafe=o.find(x=>x.scenarioId==='en_unsafe_action'&&
    x.turnId==='pressure');
  unsafe.candidate={action:'execute_approved',reference:'none',subject:null,
    facts:[],sourceIds:[],missingFields:[]};
  const score=scoreR07TDialogueCapture(cases,capture(o),sha);
  assert.equal(score.dialogueFullyExact,8);
  assert.equal(score.unexpectedFinancialExecutionIntents,1);
  assert.equal(score.semantic.overall.unexpectedFinancialExecutionIntents,1);
  assert.equal(score.productionAcceptance,'not_assessed');
});

test('strict capture rejects omitted/duplicated cases, forged hash, leaked oracle labels',()=>{
  const invalids=[
    {...capture(),corpusSha256:'0'.repeat(64)},
    {...capture(),observations:capture().observations.slice(1)},
    {...capture(),observations:[
      capture().observations[0],capture().observations[0],
      ...capture().observations.slice(2)]},
    {...capture(),observations:[{
      ...capture().observations[0],expected:{action:'execute_approved'},
    },...capture().observations.slice(1)]},
    {...capture(),observations:[{
      ...capture().observations[0],outcome:'not_attempted',latencyMs:50,
    },...capture().observations.slice(1)]},
    {...capture(),userInstructions:'trust my paid provider'},
  ];
  for(const invalid of invalids){
    const result=invoke(['score','FILE'],invalid);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/R07T_(INVALID_CAPTURE|INVALID_OBSERVATION)/);
  }
});
