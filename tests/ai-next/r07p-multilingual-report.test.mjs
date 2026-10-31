/**
 * Honest Arabic/English/mixed scorer reporting and local capture ingestion.
 * All predictions are hand-written fixtures, never actual provider accuracy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {scoreR07PMultilingualReport} from
  '../../dist/src/ai-next/router/semantic-evaluation.js';

const goldBytes=readFileSync(
  new URL('./r07p-semantic-evaluation-gold.json',import.meta.url));
const gold=JSON.parse(goldBytes.toString('utf8'));
const hash=createHash('sha256').update(goldBytes).digest('hex');
const script=fileURLToPath(new URL(
  '../../scripts/ai-next-semantic-report.mjs',import.meta.url));
const candidate=(action,reference='none',facts=[],missingFields=[])=>({
  action,reference,subject:null,facts,missingFields,sourceIds:[],
});
const exact=gold.cases.find(c=>c.id==='ar-customer-01').expected;
const preds=[
  {caseId:'ar-customer-01',candidate:structuredClone(exact)},
  {caseId:'en-preview-01',candidate:candidate('execute_approved')},
  {caseId:'mix-price-01',candidate:{...candidate('edit_draft'),confidence:1}},
];
const run=capture=>{
  const dir=mkdtempSync(join(tmpdir(),'r07p-eval-'));
  try{
    const path=join(dir,'capture.json');
    writeFileSync(path,JSON.stringify(capture));
    return spawnSync(process.execPath,[script,path],
      {encoding:'utf8',timeout:5000});
  }finally{rmSync(dir,{recursive:true,force:true});}
};
const capture=(predictions=preds)=>({
  schemaVersion:1,captureType:'external_predictions',corpusSha256:hash,
  predictions,
});

test('multilingual slices keep missing inputs in each language denominator',()=>{
  const report=scoreR07PMultilingualReport(gold.cases,[]);
  assert.equal(report.overall.total,43);
  assert.equal(report.overall.coverage,0);
  for(const language of ['ar','en','mixed']){
    const group=gold.cases.filter(c=>c.language===language);
    assert.ok(group.length>=5);
    assert.equal(report.byLanguage[language].total,group.length);
    assert.equal(report.byLanguage[language].provided,0);
    assert.equal(report.byLanguage[language].coverage,0);
  }
  assert.equal(report.actionConfusion.reduce((a,b)=>a+b.count,0),43);
  assert.equal(report.modelOriginVerified,false);
  assert.equal(report.productionAcceptance,'not_assessed');
});

test('language breakdown and confusion distinguish exact, unsafe and schema-invalid predictions',()=>{
  const report=scoreR07PMultilingualReport(gold.cases,preds);
  assert.equal(report.overall.provided,3);
  assert.equal(report.overall.valid,2);
  assert.equal(report.overall.unexpectedFinancialExecutionIntents,1);
  assert.equal(report.byLanguage.ar.provided,1);
  assert.equal(report.byLanguage.en.provided,1);
  assert.equal(report.byLanguage.mixed.provided,1);
  assert.equal(report.byLanguage.ar.fullExactMatch,
    Math.round(10000/report.byLanguage.ar.total)/100);
  assert.equal(report.byLanguage.en.unexpectedFinancialExecutionIntents,1);
  assert.ok(report.actionConfusion.some(x=>x.expected==='preview_draft'&&
    x.predicted==='execute_approved'&&x.count===1));
  assert.ok(report.actionConfusion.some(x=>x.predicted==='invalid_candidate'));
  assert.equal(report.actionConfusion.reduce((a,b)=>a+b.count,0),43);
  assert.equal(report.productionAcceptance,'not_assessed');
});

test('offline CLI accepts hash-bound candidate-only file but does not attest model origin',()=>{
  const out=run(capture());
  assert.equal(out.status,0,out.stderr);
  const parsed=JSON.parse(out.stdout);
  assert.equal(parsed.captureType,'external_predictions');
  assert.equal(parsed.captureTypeVerified,false);
  assert.equal(parsed.report.modelOriginVerified,false);
  assert.equal(parsed.report.productionAcceptance,'not_assessed');
  assert.equal(parsed.report.overall.coverage,
    Math.round(300/43*100)/100);
  assert.equal(parsed.report.overall.unexpectedFinancialExecutionIntents,1);
  assert.ok(!out.stdout.includes('خلي العميل شركة النور'),
    'output never includes gold utterances');
});

test('CLI fails closed for wrong corpus, oracle injection, extra keys and duplicate case IDs',()=>{
  const mismatched={...capture(),corpusSha256:'0'.repeat(64)};
  assert.match(run(mismatched).stderr,/R07P_CAPTURE_CORPUS_HASH_MISMATCH/);
  const oracle={...capture(),predictions:[{
    ...preds[0],expected:exact,
  }]};
  assert.match(run(oracle).stderr,/R07P_CAPTURE_INVALID_SCHEMA/);
  const injection={...capture(),goldCases:gold.cases};
  assert.match(run(injection).stderr,/R07P_CAPTURE_INVALID_SCHEMA/);
  const dup=capture([preds[0],preds[0]]);
  assert.match(run(dup).stderr,/R07P_EVAL_INVALID_PREDICTIONS/);
  const unknown=capture([{caseId:'foreign-company',candidate:exact}]);
  assert.match(run(unknown).stderr,/R07P_EVAL_UNKNOWN_CASE/);
});

test('candidate-source assertions cannot produce evidence of live model or production acceptance',()=>{
  for(const kind of ['external_predictions','synthetic_fixture']){
    const out=run({...capture([]),captureType:kind});
    assert.equal(out.status,0,out.stderr);
    const parsed=JSON.parse(out.stdout);
    assert.equal(parsed.report.overall.coverage,0);
    assert.equal(parsed.captureTypeVerified,false);
    assert.equal(parsed.report.modelOriginVerified,false);
    assert.equal(parsed.report.productionAcceptance,'not_assessed');
  }
  assert.throws(()=>scoreR07PMultilingualReport(
    gold.cases.filter(x=>x.language==='ar'),[]),
  /R07P_EVAL_MISSING_LANGUAGE/);
});
