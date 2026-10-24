import test from 'node:test';
import assert from 'node:assert/strict';
import {aiInlineTextRuns,aiTextDirection} from '../dist/src/lib/ai-text-layout.js';

test('Arabic financial explanation isolates the exact formula and percentage without changing text',()=>{
 const text='هامش الربح: 60.00%. الحسبة: (100 − 40) ÷ 100 × 100.';
 const runs=aiInlineTextRuns(text);
 assert.equal(runs.map(row=>row.text).join(''),text);
 assert.deepEqual(runs.filter(row=>row.direction==='ltr').map(row=>row.text.trim()),['60.00%','(100 − 40) ÷ 100 × 100']);
});
test('layout preserves identifiers, negative values, decimals and incomplete information verbatim',()=>{
 for(const text of ['QA-X1 و QA-X4 و QA-12-34: السعر غير متوفر.','النتيجة -12.50%، والتكلفة غير معروفة.','الحسبة (١٠٠ − ٤٠) ÷ ١٠٠ × ١٠٠.','Do not calculate 1,234.50 + 0.25; reproduce only.'])
  assert.equal(aiInlineTextRuns(text).map(row=>row.text).join(''),text);
 assert.equal(aiInlineTextRuns('QA-12-34').some(row=>row.direction),false);
});
test('table direction follows header language independently of the interface',()=>{
 assert.equal(aiTextDirection('SKU Quantity Unit Price (USD)'),'ltr');
 assert.equal(aiTextDirection('الصنف الكمية سعر الوحدة'),'rtl');
 assert.equal(aiTextDirection('123 — الصنف'),'rtl');
 assert.equal(aiTextDirection('数量 単価'),'ltr');
});
