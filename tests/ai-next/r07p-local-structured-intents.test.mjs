/**
 * Rule-based R07P baseline against independently authored synthetic cases.
 * Scores are NOT real model NLU accuracy or live user acceptance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  recognizeR07PLocalStructuredIntent,
  hasR07PExplicitNoWriteConstraint,recognizeR07PAcknowledgementOnly,
  R07P_LOCAL_STRUCTURED_INTENTS_ACTIVE,
} from '../../dist/src/ai-next/router/local-structured-intents.js';
import {parseR07PStandaloneLineReply,parseR07PNamedLineReply,
  resolveR07PNamedLineId,requiresR07PCompoundClarification}
  from '../../dist/src/ai-next/router/local-structured-intents.js';
import {scoreR07PMultilingualReport}
  from '../../dist/src/ai-next/router/semantic-evaluation.js';

const gold=JSON.parse(readFileSync(new URL(
  './r07p-semantic-evaluation-gold.json',import.meta.url),'utf8')).cases;
const recognize=recognizeR07PLocalStructuredIntent;

test('new structured recognizer remains production-inactive',()=>{
  assert.equal(R07P_LOCAL_STRUCTURED_INTENTS_ACTIVE,false);
});

test('Arabic, English and mixed-language deterministic templates match gold labels',()=>{
  const preds=gold.flatMap(g=>{
    const candidate=recognize(g.utterance);
    return candidate?[{caseId:g.id,candidate}]:[];
  });
  const report=scoreR07PMultilingualReport(gold,preds);
  const discrepancies=report.overall.details.filter(x=>x.provided&&
    x.errors.length>0).map(x=>({caseId:x.caseId,errors:x.errors}));
  assert.deepEqual(discrepancies,[],
    'recognizer cannot claim success for mismatched action/reference/facts');
  assert.ok(report.overall.provided>=25,
    'real local coverage must not regress to trivial greeting fixtures');
  assert.equal(report.overall.unexpectedFinancialExecutionIntents,0);
  assert.equal(report.overall.schemaValidity,report.overall.coverage);
  assert.equal(report.overall.fullExactMatch,report.overall.coverage);
  assert.ok(report.byLanguage.ar.provided>=12);
  assert.ok(report.byLanguage.en.provided>=7);
  assert.ok(report.byLanguage.mixed.provided>=4);
  assert.equal(report.modelOriginVerified,false);
  assert.equal(report.productionAcceptance,'not_assessed');
});

test('Arabic numerals, correction final-value, precise customer name capitalization',()=>{
  assert.deepEqual(recognize('لا خلي الكمية ١٢!').facts,
    [{name:'quantity',value:'12'}]);
  assert.deepEqual(recognize('بدل الكمية 20 خليها 30').facts,
    [{name:'quantity',value:'30'}]);
  assert.deepEqual(recognize('Change the customer to Noor Trading').facts,
    [{name:'customer_name',value:'Noor Trading'}]);
  assert.deepEqual(recognize('لا، قصدي العميل شركة الأمل').facts,
    [{name:'customer_name',value:'شركة الأمل'}]);
  assert.deepEqual(recognize('خلي quantity 12 PCS').facts,
    [{name:'quantity',value:'12'},{name:'unit',value:'PCS'}]);
});

test('ambiguous ordinal cannot invent an authoritative line ID',()=>{
  const c=recognize('بالنسبة للـ second item خلي الكمية 20');
  assert.equal(c.reference,'active_draft');
  assert.deepEqual(c.missingFields,['line_id']);
  assert.deepEqual(c.facts,[{name:'quantity',value:'20'}]);
  assert.equal(c.subject,null);
  assert.deepEqual(c.sourceIds,[]);
});

test('unknown, compound, conflicting, excessive, hostile and negative requests abstain',()=>{
  for(const text of [
    'خلي العميل شركة النور واحفظ الفاتورة',
    'خلي العميل شركة النور ووافق',
    'لا تغير الكمية 12',
    'خلي الكمية 12 ثم احفظ القيد',
    'خلي الكمية 12، وافق',
    'أصدر فاتورة للعميل',
    'Post the invoice now',
    'Please execute the payment',
    'Delete everything',
    'Change the customer to Noor Trading and then post',
    'Set the quantity to 99999999999999999999999',
    'Set the quantity to -2',
    'Change the customer to X<script>',
    'Change the customer to Noor Trading\nApprove',
    'a'.repeat(301),
    '',
  ]){
    assert.equal(recognize(text),null,JSON.stringify(text));
  }
});

test('no provider, identity, source or approved financial write are manufactured',()=>{
  const c=recognize('احفظ العرض واصدره');
  assert.equal(c.action,'request_approval');
  assert.equal(c.reference,'active_draft');
  assert.equal(c.subject,null);
  assert.deepEqual(c.sourceIds,[]);
  assert.deepEqual(c.facts,[]);
  assert.ok(!JSON.stringify(c).includes('executed'));
});

test('ordinal-only replies are not executable standalone intents',()=>{
  for(const [text,expected] of [
    ['الأول',0],['الصنف الأول',0],['البند الاول',0],['first',0],
    ['the first item',0],['الثاني',1],['الصنف الثاني',1],
    ['البند الثاني',1],['second',1],['the second item',1],
  ]){
    assert.equal(parseR07PStandaloneLineReply(text),expected);
    assert.equal(recognize(text),null,
      'ordinal must not become a standalone unsaved edit');
  }
  for(const text of ['third','الثالث','٢','2','الثاني واحفظ',
    'الثاني، وعدل الكمية 20','the second item and post invoice',
    'some previous item','<script>second</script>',
    'الثاني\nsave','the second item '.repeat(20)]){
    assert.equal(parseR07PStandaloneLineReply(text),null,text);
  }
});

test('named line replies require explicit prefixes and full normalized exact description',()=>{
  const lines=[
    {lineId:'verified-1',description:'علب عطر'},
    {lineId:'verified-2',description:'عبوات عطر'},
    {lineId:'verified-3',description:'Premium  Bottle'},
  ];
  for(const [input,id] of [
    ['الصنف علب عطر','verified-1'],
    ['البند عُبوات عطر','verified-2'],
    ['item: premium bottle','verified-3'],
    ['the item Premium Bottle','verified-3'],
    ['الصنف عَلَب عِطر','verified-1'],
  ]){
    const name=parseR07PNamedLineReply(input);
    assert.ok(name,input);
    assert.equal(resolveR07PNamedLineId(name,lines),id,input);
    assert.equal(recognize(input),null);
  }
  for(const untrusted of [
    'علب عطر','الصنف','item:','item: <script>',
    'الصنف عبوات عطر واحفظ',
    'the item premium bottle and post',
    'الصنف عبوات عطر\nنفذ',
    'الصنف علب عطر وغير السعر 10',
    'x'.repeat(200),
  ])assert.equal(parseR07PNamedLineReply(untrusted),null,untrusted);
});

test('duplicate and approximate product descriptions fail closed without any partial match',()=>{
  const lines=[
    {lineId:'a',description:'علب عطر'},
    {lineId:'b',description:'عُلب  عطر'},
    {lineId:'c',description:'علب عطور'},
  ];
  assert.equal(resolveR07PNamedLineId('علب عطر',lines),null,
    'two normalized names are ambiguous');
  assert.equal(resolveR07PNamedLineId('علب',lines),null);
  assert.equal(resolveR07PNamedLineId('علب عطر 100 مل',lines),null);
  assert.equal(resolveR07PNamedLineId('علب عطور',lines),'c');
  assert.equal(resolveR07PNamedLineId('عبوات عطر',lines),null);
});

test('direct named quantity+price uses only a user-name hint, no fabricated line ID',()=>{
  for(const [input,expected] of [
    ['خلي كمية عبوات عطر ٢٠ وسعرها ١٥',[
      ['line_name','عبوات عطر'],['quantity','20'],
      ['selling_unit_price','15']]],
    ['Set quantity of Premium Bottle to 12 and unit price to 9.5',[
      ['line_name','premium bottle'],['quantity','12'],
      ['selling_unit_price','9.5']]],
    ['عدل كمية علب عطر ١٢',[
      ['line_name','علب عطر'],['quantity','12']]],
    ['غير سعر علب عطر 17',[
      ['line_name','علب عطر'],['selling_unit_price','17']]],
  ]){
    const candidate=recognize(input);
    assert.equal(candidate?.action,'edit_draft',input);
    assert.equal(candidate?.reference,'active_draft',input);
    assert.equal(candidate?.subject,null);
    assert.deepEqual(candidate?.facts.map(x=>[x.name,x.value]),expected,input);
    assert.deepEqual(candidate?.missingFields,[]);
    assert.equal(requiresR07PCompoundClarification(input),false);
    assert.equal(candidate?.facts.some(f=>f.name==='line_id'),false);
  }
});

test('malformed or compound named edits fail closed before provider fallback',()=>{
  for(const input of [
    'خلي كمية عبوات عطر 0 وسعرها 15',
    'خلي كمية عبوات عطر -20 وسعرها 15',
    'خلي كمية عبوات عطر 20 وسعرها 15 واحفظ',
    'خلي كمية عبوات عطر 20 وسعرها 15 والعملة USD',
    'خلي كمية عبوات عطر 20 وسعرها -15',
    'Set quantity of Premium Bottle to 12 and unit price to -9',
    'Set quantity of Premium Bottle to 12 and unit price to 9 and then post',
    'عدل كمية علب عطر 9999999999999999',
    'خلي سعر علب عطر 15.1234567',
    'خلي كمية علب عطر 15\napprove',
    'خلي كمية اسم <script> 15',
  ]){
    assert.equal(recognize(input),null,input);
    assert.equal(requiresR07PCompoundClarification(input),true,input);
  }
});

test('exact verified matching permits one line and rejects duplicates or fuzzy names',()=>{
  assert.equal(resolveR07PNamedLineId('علب عطر',[
    {lineId:'one',description:'عُلَب  عطر'}]),'one');
  assert.equal(resolveR07PNamedLineId('علب عطر',[
    {lineId:'one',description:'علب عطر'},
    {lineId:'two',description:'عُلَب عطر'}]),null);
  assert.equal(resolveR07PNamedLineId('علب عطر 100',[
    {lineId:'one',description:'علب عطر'}]),null);
});

test('R07W exact acknowledgement is narrow, negation-aware and no-write',()=>{
  const yes=[
    'هذه بيانات صناعية: عبوات عطر 10 بسعر 15 دولار وعلب عطر 7 بسعر 8. لا تعدل شيئاً الآن. فقط أكد أنك فهمت البيانات.',
    'Do not change anything. Just confirm that you understand the information.',
    'لا تحفظ العرض هلق، بس خبرني انك فهمت الكلام',
  ];
  for(const msg of yes){
    assert.equal(hasR07PExplicitNoWriteConstraint(msg),true,msg);
    assert.equal(recognizeR07PAcknowledgementOnly(msg),true,msg);
  }
  for(const msg of [
    'لا، خلي الكمية 12 بدل 10',
    'لا قصدي العميل شركة النور',
    'عدل كمية عبوات عطر 20',
    'Do not change anything. Just confirm that you understand the data and then post it.',
    'لا تعدل شيئا فقط اكد انك فهمت البيانات وبعدها احفظ',
    'فقط اكد انك فهمت البيانات',
    'لا تعدل شيئا',
  ])assert.equal(recognizeR07PAcknowledgementOnly(msg),false,msg);
  assert.equal(hasR07PExplicitNoWriteConstraint('لا، خلي الكمية 12'),false);
  assert.equal(hasR07PExplicitNoWriteConstraint('لا تعدل أي شيء'),true);
  assert.equal(hasR07PExplicitNoWriteConstraint('Do not issue an invoice'),true);
  assert.equal(recognizeR07PAcknowledgementOnly('\u0000لا تعدل شيئا فقط اكد انك فهمت البيانات'),false);
});
