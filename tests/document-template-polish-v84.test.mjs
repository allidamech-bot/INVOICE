import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const templates=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

test('historical v84 polish is retired beneath the canonical template system',()=>{
  const html=read('index.html');
  const sw=read('public/sw.js');
  assert.doesNotMatch(html,/document-template-polish-v84\.css/);
  assert.match(html,/document-premium-redesign-v141\.css/);
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/document-premium-redesign-v141\.css/);
});

test('all 18 invoice and proforma template identities receive explicit polish',()=>{
  const css=read('src/styles/document-template-polish-v84.css');
  for(const id of templates) assert.match(css,new RegExp(`\\.template-${id}(?:\\s|\\.|\\{|\\:)`),`missing polish for ${id}`);
});

test('final commercial zone handles missing optional blocks without layout collapse',()=>{
  const css=read('src/styles/document-template-polish-v84.css');
  assert.match(css,/lower-grid:not\(:has\(\.terms-block\)\) \.totals-block/);
  assert.match(css,/bottom-grid:has\(\.bank-block:only-child\)/);
  assert.match(css,/bottom-grid:has\(\.signature-block:only-child\)/);
});

test('v84 keeps document output isolated and bilingual text intentionally wrapped',()=>{
  const css=read('src/styles/document-template-polish-v84.css');
  assert.doesNotMatch(css,/\.editor-screen|\.settings-modal|\.documents-page|\.app-header/);
  assert.match(css,/lang-bilingual \.description-cell \.bi-value/);
  assert.match(css,/grid-template-columns:1fr/);
  assert.match(css,/@media print/);
});
