import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v83 document layout is the final shared output layer and ships offline',()=>{
  const html=read('index.html');
  const sw=read('public/sw.js');
  const css=read('src/styles/document-layout-v83.css');
  assert.match(html,/document-layout-v83\.css/);
  assert.ok(html.indexOf('document-layout-v83.css')>html.indexOf('document-ux-v82.css'));
  assert.match(sw,/lourex-invoice-v83/);
  assert.match(sw,/document-layout-v83\.css/);
  assert.match(css,/\.invoice-page \.final-details/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
});

test('commercial terms cannot collapse into narrow two-column letter wrapping',()=>{
  const css=read('src/styles/document-layout-v83.css');
  assert.match(css,/\.invoice-page \.terms-grid[\s\S]*grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/\.invoice-page \.term-row[\s\S]*grid-template-columns:minmax\(28mm,34%\) minmax\(0,1fr\)/);
  assert.match(css,/\.invoice-page \.term-row span[\s\S]*overflow-wrap:anywhere/);
});

test('all templates share balanced party, totals, bank and signature guardrails',()=>{
  const css=read('src/styles/document-layout-v83.css');
  assert.match(css,/\.invoice-page \.party-grid/);
  assert.match(css,/\.invoice-page \.lower-grid/);
  assert.match(css,/\.invoice-page \.bottom-grid/);
  assert.match(css,/\.invoice-page \.bank-block>div/);
  assert.match(css,/\.invoice-page \.signature-media/);
  assert.match(css,/template-carbon \.party-customer[\s\S]*margin-top:0!important/);
  assert.match(css,/template-carbon \.lower-grid/);
});

test('v83 remains document-only and preserves print page-break safety',()=>{
  const css=read('src/styles/document-layout-v83.css');
  assert.doesNotMatch(css,/\.editor-screen|\.settings-modal|\.app-header|\.documents-page/);
  assert.match(css,/@media print/);
  assert.match(css,/break-inside:avoid!important/);
  assert.match(css,/page-break-inside:avoid!important/);
});
