import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v120 premium document art direction is loaded after the existing document stack',async()=>{
  const [html,css]=await Promise.all([
    read('index.html'),
    read('src/styles/document-art-direction-v120.css')
  ]);
  assert.match(html,/@import url\("\.\/styles\/document-art-direction-v120\.css"\)/);
  assert.match(css,/v120 — LOUREX premium document art direction/);
  assert.ok(html.indexOf('document-output-v119.css')<html.indexOf('document-art-direction-v120.css'));
});

test('v120 creates customer-first hierarchy and a deliberate commercial closing zone',async()=>{
  const css=await read('src/styles/document-art-direction-v120.css');
  assert.match(css,/\.invoice-page \.party-grid\s*\{[^}]*\.82fr[^}]*1\.18fr/s);
  assert.match(css,/\.invoice-page \.party-customer\s*\{/);
  assert.match(css,/\.invoice-page \.lower-grid\s*\{/);
  assert.match(css,/\.invoice-page \.grand-total\s*\{/);
  assert.match(css,/\.invoice-page \.final-details\{position:relative\}/);
});

test('v120 compresses continuation pages instead of repeating full hero headers',async()=>{
  const css=await read('src/styles/document-art-direction-v120.css');
  assert.match(css,/\.invoice-pages>\.invoice-page:not\(:first-child\) \.header-modern/);
  assert.match(css,/min-height:20mm!important/);
  assert.match(css,/\.invoice-pages>\.invoice-page:not\(:first-child\) \.modern-geometry/);
  assert.match(css,/\.doc-meta>div:first-child\{display:flex!important/);
});

test('v120 gives every template family explicit art direction without touching editor chrome',async()=>{
  const css=await read('src/styles/document-art-direction-v120.css');
  for(const id of ['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon']){
    assert.match(css,new RegExp(`\\.template-${id}`),`${id} should receive explicit v120 art direction`);
  }
  assert.doesNotMatch(css,/\.app-ui|\.editor-|\.documents-page|\.customers-page/);
  assert.match(css,/@media print/);
  assert.match(css,/\.invoice-page\.lang-ar/);
});