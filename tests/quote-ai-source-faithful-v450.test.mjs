import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v450 AI quotation save does not silently reapply customer/company commercial defaults after review',async()=>{
  const source=await read('src/components/AiWorkflowTools.tsx');
  assert.doesNotMatch(source,/applyCustomerCommercialDefaults/);
  assert.match(source,/paymentTermPresetId:''/);
  assert.match(source,/dueDate:''/);
  assert.match(source,/incoterm:draft\.incoterm\.trim\(\)/);
  assert.match(source,/paymentTerms:draft\.paymentTerms\.trim\(\)/);
  assert.match(source,/deliveryTime:draft\.deliveryTime\.trim\(\)/);
  assert.match(source,/validity:draft\.validity\.trim\(\)/);
  assert.match(source,/remarks:draft\.remarks\.trim\(\)/);
  assert.match(source,/taxEnabled:false,taxPercent:'0'/);
  assert.doesNotMatch(source,/draft\.incoterm\|\|doc\.terms\.incoterm/);
  assert.doesNotMatch(source,/draft\.paymentTerms\|\|doc\.terms\.paymentTerms/);
  assert.doesNotMatch(source,/\[doc\.notes,draft\.notes/);
});

test('v450 quotation review exposes source commercial terms before the user saves the AI draft',async()=>{
  const source=await read('src/components/AiWorkflowTools.tsx');
  assert.match(source,/function sourceCommercialTerms/);
  assert.match(source,/Commercial terms explicitly found in the source/);
  assert.match(source,/No commercial terms were explicitly found in the source/);
  assert.match(source,/keep them blank in this AI draft/);
});
