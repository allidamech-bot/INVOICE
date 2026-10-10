import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [rtl,editor,payments,profitability,operations]=await Promise.all([
  readFile('src/styles/rtl.css','utf8'),
  readFile('src/components/EditorPageCore.tsx','utf8'),
  readFile('src/components/InvoicePaymentsPanel.tsx','utf8'),
  readFile('src/components/ProfitabilityPanel.tsx','utf8'),
  readFile('src/components/OperationsPage.tsx','utf8')
]);

test('Arabic numeric-entry controls maintain left-to-right decimal entry and bidi isolation',()=>{
 for(const token of ['input[inputmode="decimal"]','direction:ltr','text-align:left','unicode-bidi:isolate'])assert.ok(rtl.includes(token),token);
 for(const [name,source] of [['editor',editor],['payments',payments],['profitability',profitability],['operations',operations]])assert.ok(source.includes('inputMode="decimal"'),name+' decimal controls must use the shared selector');
});

test('RTL shell isolates dates phone fields and visible editor money strings',()=>{
  assert.match(rtl,/input\[type="date"\]/);
  assert.match(rtl,/input\[type="tel"\]/);
  assert.match(rtl,/\.editor-grand-total-chip strong/);
  assert.match(rtl,/\.item-line-total/);
  assert.match(rtl,/\.premium-item-card footer strong/);
  assert.match(rtl,/unicode-bidi:isolate/);
});
