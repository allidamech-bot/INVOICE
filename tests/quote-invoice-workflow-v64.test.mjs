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

test('quote conversion is a final-only workflow action and the editable design control is retired',async()=>{
  const [editor,core,css]=await Promise.all([
    read('src/components/EditorPage.tsx'),
    read('src/components/EditorPageCore.tsx'),
    read('src/styles/editor-workflow-v61.css')
  ]);
  assert.match(core,/convert-invoice-button/);
  assert.match(css,/\.app-ui \.convert-invoice-button\{display:none!important\}/);
  assert.match(editor,/props\.document\.kind==='proforma'&&props\.document\.status==='final'/);
  assert.match(editor,/convertedFromId===props\.document\.id/);
  assert.match(editor,/Invoice already created from this quote/);
  assert.match(editor,/Create Invoice from Quote/);
});

test('document workspace suppresses duplicate conversion and opens the linked invoice instead',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/linkedInvoiceForQuote/);
  assert.match(source,/item\.convertedFromId===doc\.id&&item\.lifecycleStatus!=='voided'/);
  assert.match(source,/&&!linkedInvoice\)/);
  assert.match(source,/Open linked invoice/);
  assert.match(source,/فتح الفاتورة المرتبطة/);
});

test('v64 workflow assets remain present in later PWA releases',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.ok(sw.includes('./src/components/DocumentReviewModal.js'));
  assert.ok(sw.includes('./src/components/EditorPageCore.js'));
  assert.ok(sw.includes('./styles/editor-workflow-v61.css'));
});
