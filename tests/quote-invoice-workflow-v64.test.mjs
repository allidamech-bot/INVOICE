import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('v64 final review explains the irreversible workflow step before issuing',async()=>{
  const source=await read('src/components/DocumentReviewModal.tsx');
  assert.match(source,/Final check before issue/);
  assert.match(source,/Confirming will save this exact version as Final/);
  assert.match(source,/lock it against accidental edits/);
  assert.match(source,/Back to document/);
  assert.match(source,/Confirm & Issue/);
});

test('v64 review keeps document identity and amount visible at confirmation',async()=>{
  const source=await read('src/components/DocumentReviewModal.tsx');
  assert.match(source,/doc\.number/);
  assert.match(source,/customer\|\|'—'/);
  assert.match(source,/doc\.items\.length/);
  assert.match(source,/formatMoney\(totals\.grandTotal,doc\.currency\)/);
  assert.match(source,/issue-total-check/);
});

test('v64 conversion guidance explicitly preserves the source quote',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  const css=await read('src/styles/editor-workflow-v61.css');
  assert.match(editor,/Convert to Invoice/);
  assert.match(css,/Creates a new invoice and keeps this quote/);
  assert.match(css,/ينشئ فاتورة جديدة ويحافظ على عرض السعر/);
});

test('v64 workflow assets remain present in later PWA releases',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.ok(sw.includes('./src/components/DocumentReviewModal.js'));
  assert.ok(sw.includes('./src/components/EditorPageCore.js'));
  assert.ok(sw.includes('./styles/editor-workflow-v61.css'));
});
