/**
 * R07P bounded multi-field grammar and block-before-fallback safety tests.
 * No provider invocations, real Firebase, real customer data or finance writes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizeR07PLocalStructuredIntent as parse,
  requiresR07PCompoundClarification as block}
  from '../../dist/src/ai-next/router/local-structured-intents.js';

const facts=[{name:'quantity',value:'12'},
  {name:'selling_unit_price',value:'15'}];
const exact=[
  'خلي الكمية ١٢ والسعر ١٥',
  'غير الكمية 12 وسعر القطعة 15',
  'عدل السعر 15 والكمية 12',
  'Set quantity to 12 and unit price to 15',
  'Set the unit price to 15 and the quantity to 12',
];
test('supported bilingual paired updates have identical complete one-line facts',()=>{
  for(const sentence of exact){
    const out=parse(sentence);
    assert.ok(out,sentence);
    assert.equal(out.action,'edit_draft');
    assert.equal(out.reference,'active_draft');
    assert.deepEqual(out.facts,facts);
    assert.deepEqual(out.missingFields,[]);
    assert.deepEqual(out.sourceIds,[]);
    assert.equal(out.subject,null);
    assert.equal(block(sentence),false);
  }
});
test('decimal normalized inputs preserve final requested values without rounding',()=>{
  const out=parse('خلي الكمية ١٢.٥ والسعر ١٥.٢٥');
  assert.deepEqual(out.facts,[
    {name:'quantity',value:'12.5'},
    {name:'selling_unit_price',value:'15.25'},
  ]);
});
test('no partial acceptance of compound approvals, cross-record edits or extra currency',()=>{
  const bad=[
    'خلي الكمية 12 والسعر 15 واحفظ',
    'خلي الكمية 12 والسعر 15 واصدر الفاتورة',
    'Set quantity to 12 and unit price to 15 and then issue the invoice',
    'خلي العميل شركة النور والعملة USD',
    'خلي الكمية 12 والعملة USD',
    'Change the customer to Noor Trading and currency USD',
    'خلي الكمية 12 والسعر 15 وcurrency USD',
    'خلي السعر 15 والعميل شركة النور',
  ];
  for(const sentence of bad){
    assert.equal(parse(sentence),null,sentence);
    assert.equal(block(sentence),true,sentence);
  }
});
test('out-of-range and nonpositive quantities never receive partial multi-field approval',()=>{
  for(const s of [
    'خلي الكمية 0 والسعر 15',
    'خلي الكمية -12 والسعر 15',
    'خلي الكمية 99999999999999999 والسعر 15',
    'Set quantity to 12 and unit price to -20',
    'خلي الكمية 12 والسعر 15.1234567',
  ]){
    assert.equal(parse(s),null,s);
  }
});
test('exact approval-only phrases remain separate and cannot become line patches',()=>{
  for(const s of ['احفظ العرض واصدره','approve and post this invoice']){
    assert.equal(parse(s)?.action,'request_approval');
    assert.equal(block(s),false);
    assert.deepEqual(parse(s)?.facts,[]);
  }
});
