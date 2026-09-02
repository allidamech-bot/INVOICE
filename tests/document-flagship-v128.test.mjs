import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v128 flagship design layer loads after dark contrast and remains document-only',async()=>{
  const [html,css]=await Promise.all([
    read('index.html'),
    read('src/styles/document-flagship-v128.css')
  ]);
  const contrast=html.indexOf('document-dark-contrast-v126.css');
  const flagship=html.indexOf('document-flagship-v128.css');
  assert.ok(contrast>=0&&flagship>contrast,'flagship layer must load after v126 contrast');
  assert.match(css,/\.invoice-page:is\(\.template-executive,\.template-trade,\.template-editorial,\.template-signature,\.template-midnight,\.template-blackivory\)/);
  assert.doesNotMatch(css,/\.app-shell|\.documents-page|\.editor-screen/);
});

test('v128 raises printable hierarchy and gives total/signature stronger commercial emphasis',async()=>{
  const css=await read('src/styles/document-flagship-v128.css');
  assert.match(css,/\.doc-title span\{\s*font-size:27px/);
  assert.match(css,/\.items-table td\{\s*padding:2\.9mm 1\.55mm;\s*font-size:8\.25px/);
  assert.match(css,/\.party-customer \.party-name\{\s*font-size:14px/);
  assert.match(css,/\.grand-total strong\{\s*font-size:13px/);
  assert.match(css,/\.signature-block:after\{/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
});

test('v128 turns flagship dark templates into print-friendly dark masthead plus light body',async()=>{
  const css=await read('src/styles/document-flagship-v128.css');
  assert.match(css,/\.invoice-page\.template-midnight\{\s*background:#fbfaf6!important;\s*color:#162531!important/);
  assert.match(css,/first-child\.template-midnight \.header-modern\{[\s\S]*background:#081d2e/);
  assert.match(css,/\.invoice-page\.template-blackivory\{\s*background:#f5f0e6!important;\s*color:#1d1d1b!important/);
  assert.match(css,/first-child\.template-blackivory \.header-modern\{[\s\S]*background:#11110f/);
  assert.match(css,/\.template-midnight \.items-table td,[\s\S]*color:#162531!important/);
  assert.match(css,/\.template-blackivory \.items-table td,[\s\S]*color:#1d1d1b!important/);
});

test('v128 gives the six flagship families visibly different art direction',async()=>{
  const css=await read('src/styles/document-flagship-v128.css');
  for(const token of [
    'template-executive .header-executive',
    'template-trade .header-trade',
    'template-editorial .header-modern',
    'template-signature .header-signature',
    'template-midnight .header-modern',
    'template-blackivory .header-modern'
  ]) assert.ok(css.includes(token),`missing art direction for ${token}`);
  assert.match(css,/template-editorial \.doc-title span\{[\s\S]*font-size:31px!important/);
  assert.match(css,/template-trade \.party-customer\{[\s\S]*border-inline-start:1\.2mm solid #b58b4f/);
  assert.match(css,/template-signature \.signature-title\{[\s\S]*border-inline-start:\.9mm solid #b58b4f/);
});
