/**
 * Offline evaluator QA: checks measurement correctness and gold-label
 * consistency. It never produces an AI/model accuracy number.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreR07PSemanticCandidates}
  from '../../dist/src/ai-next/router/semantic-evaluation.js';
const corpus=JSON.parse(readFileSync(
  new URL('./r07p-semantic-evaluation-gold.json',import.meta.url),'utf8'
));
const fixture=(action,reference='none',facts=[],missingFields=[],sourceIds=[])=>({
  action,reference,subject:null,facts,missingFields,sourceIds,
});
test('gold corpus has independently labelled dialect, numeric, corrections, negation and languages',()=>{
  assert.equal(corpus.schemaVersion,1);
  assert.ok(corpus.cases.length>=40);
  assert.equal(new Set(corpus.cases.map(x=>x.id)).size,corpus.cases.length);
  for(const language of ['ar','en','mixed']){
    assert.ok(corpus.cases.filter(x=>x.language===language).length>=5);
  }
  assert.ok(corpus.cases.some(x=>/١٢/.test(x.utterance)));
  assert.ok(corpus.cases.some(x=>/\bNo,\b|لا،/.test(x.utterance)));
  assert.ok(corpus.cases.some(x=>/لا تحفظ|Don't issue/.test(x.utterance)));
  assert.ok(corpus.cases.some(x=>x.expected.missingFields.length>0));
  assert.ok(corpus.cases.some(x=>x.expected.action==='execute_approved'));
  const noModels=scoreR07PSemanticCandidates(corpus.cases,[]);
  assert.equal(noModels.total,corpus.cases.length);
  assert.equal(noModels.coverage,0);
  assert.equal(noModels.schemaValidity,0);
  assert.equal(noModels.actionAccuracy,0);
  assert.equal(noModels.fullExactMatch,0);
  assert.equal(noModels.details.length,corpus.cases.length);
  assert.ok(noModels.details.every(x=>!x.provided));
});
test('independent predictions distinguish exact intent, slots, denied and invalid candidates',()=>{
  const preds=[
    {caseId:'ar-customer-01',candidate:fixture('edit_draft',
      'active_draft',[{name:'customer_name',value:'شركة النور'}])},
    {caseId:'ar-quantity-01',candidate:fixture('edit_draft',
      'active_draft',[{name:'quantity',value:'10'}])},
    {caseId:'en-preview-01',candidate:fixture('execute_approved',
      'none')},
    {caseId:'mix-price-01',candidate:{...fixture('edit_draft',
      'active_draft',[{name:'selling_unit_price',value:'15'}]),
      modelSelfReportedConfidence:1}},
  ];
  const report=scoreR07PSemanticCandidates(corpus.cases,preds);
  assert.equal(report.total,corpus.cases.length);
  assert.equal(report.provided,4);
  assert.equal(report.valid,3);
  assert.ok(report.coverage<10);
  assert.equal(report.unexpectedFinancialExecutionIntents,1);
  const get=id=>report.details.find(x=>x.caseId===id);
  assert.equal(get('ar-customer-01').factsExact,true);
  assert.equal(get('ar-quantity-01').actionCorrect,true);
  assert.equal(get('ar-quantity-01').factsExact,false);
  assert.equal(get('en-preview-01').unexpectedFinancialExecutionIntent,true);
  assert.equal(get('mix-price-01').valid,false);
  assert.ok(report.fullExactMatch<report.coverage);
  assert.equal(report.details.filter(x=>x.provided).length,4);
});
test('identical predictions based on separate immutable examples can score correctly',()=>{
  const independent=[
    {caseId:'en-draft-01',candidate:fixture('prepare_quote')},
    {caseId:'en-unit-01',candidate:fixture('edit_draft',
      'active_draft',[{name:'unit',value:'carton'}])},
  ];
  const report=scoreR07PSemanticCandidates(corpus.cases,independent);
  const evaluated=report.details.filter(x=>x.provided);
  assert.equal(evaluated.length,2);
  assert.ok(evaluated.every(x=>x.valid&&x.actionCorrect&&x.factsExact));
  assert.ok(report.fullExactMatch>0);
  assert.ok(report.fullExactMatch<10,
    'partial model coverage can never report 100%');
});
test('unknown, duplicate, malformed and oracle-contaminated case structures fail closed',()=>{
  const a={caseId:'ar-customer-01',candidate:fixture('edit_draft')};
  assert.throws(()=>scoreR07PSemanticCandidates(corpus.cases,[a,a]),
    /R07P_EVAL_INVALID_PREDICTIONS/);
  assert.throws(()=>scoreR07PSemanticCandidates(corpus.cases,[
    {caseId:'invented-case',candidate:fixture('edit_draft')},
  ]),/R07P_EVAL_UNKNOWN_CASE/);
  const bad=structuredClone(corpus.cases);
  bad[0].expected.action='unknown_financial_operation';
  assert.throws(()=>scoreR07PSemanticCandidates(bad,[]),
    /R07P_EVAL_INVALID_GOLD_CORPUS/);
  const duplicated=structuredClone(corpus.cases);
  duplicated[1].id=duplicated[0].id;
  assert.throws(()=>scoreR07PSemanticCandidates(duplicated,[]),
    /R07P_EVAL_INVALID_GOLD_CORPUS/);
  const contaminated=structuredClone(corpus.cases);
  contaminated[1].expected.facts=[
    {name:'quantity',value:'12'},{name:'quantity',value:'20'},
  ];
  assert.throws(()=>scoreR07PSemanticCandidates(contaminated,[]),
    /R07P_EVAL_INVALID_GOLD_CORPUS/);
});
