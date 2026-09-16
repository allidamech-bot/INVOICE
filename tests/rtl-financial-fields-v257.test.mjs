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

test('RTL shell isolates every decimal input used by core financial workspaces',()=>{
  assert.match(rtl,/input\[inputmode="decimal"\]\{direction:ltr;text-align:left;unicode-bidi:isolate\}/);
  for(const [name,source] of [['editor',editor],['payments',payments],['profitability',profitability],['operations',operations]]){
    assert.match(source,/inputMode="decimal"/,`${name} must expose decimal controls through the shared RTL selector`);
  }
});

test('RTL shell isolates dates phone fields and visible editor money strings',()=>{
  assert.match(rtl,/input\[type="date"\]/);
  assert.match(rtl,/input\[type="tel"\]/);
  assert.match(rtl,/\.editor-grand-total-chip strong/);
  assert.match(rtl,/\.item-line-total/);
  assert.match(rtl,/\.premium-item-card footer strong/);
  assert.match(rtl,/unicode-bidi:isolate/);
});
