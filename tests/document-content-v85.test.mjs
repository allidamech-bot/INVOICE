import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('historical v85 content layer is retired from runtime and replaced canonically',()=>{
  const html=read('index.html');
  const sw=read('public/sw.js');
  assert.doesNotMatch(html,/document-content-v85\.css/);
  assert.match(html,/document-premium-redesign-v141\.css/);
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/document-premium-redesign-v141\.css/);
});

test('document metadata adapts to optional due dates without empty header slots',()=>{
  const css=read('src/styles/document-content-v85.css');
  assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(25mm,1fr\)\)!important/);
  assert.match(css,/\.doc-meta span[\s\S]*unicode-bidi:isolate/);
});

test('item quantities and money columns have stable commercial alignment in every language',()=>{
  const css=read('src/styles/document-content-v85.css');
  assert.match(css,/td:nth-last-child\(4\)[\s\S]*direction:ltr/);
  assert.match(css,/td:nth-last-child\(2\)[\s\S]*direction:ltr/);
  assert.match(css,/td:last-child[\s\S]*font-variant-numeric:tabular-nums/);
  assert.match(css,/lang-ar \.description-cell/);
  assert.match(css,/lang-bilingual \.description-cell/);
});

test('totals, bank identifiers and footer resist RTL and long-value collisions',()=>{
  const css=read('src/styles/document-content-v85.css');
  assert.match(css,/\.total-row,[\s\S]*grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css,/bank-block>div:nth-of-type\(3\) span/);
  assert.match(css,/bank-block>div:nth-of-type\(4\) span/);
  assert.match(css,/doc-footer>span:first-child[\s\S]*text-overflow:ellipsis/);
  assert.match(css,/lang-ar \.total-row>strong/);
});

test('v85 remains isolated to printable document output and keeps print safeguards',()=>{
  const css=read('src/styles/document-content-v85.css');
  assert.doesNotMatch(css,/\.editor-screen|\.settings-modal|\.documents-page|\.app-header/);
  assert.match(css,/@media print/);
  assert.match(css,/break-inside:avoid/);
  assert.match(css,/page-break-inside:avoid/);
});
