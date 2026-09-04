import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v157 loads before the canonical A4 layer and ships to installed PWAs',async()=>{
  const [html,css,sw]=await Promise.all([
    read('index.html'),
    read('src/styles/document-output-quality-v157.css'),
    read('public/sw.js')
  ]);
  assert.ok(html.indexOf('mobile-preview-v156.css')<html.indexOf('document-output-quality-v157.css'));
  assert.ok(html.indexOf('document-output-quality-v157.css')<html.indexOf('document-premium-redesign-v141.css'));
  assert.match(sw,/^const CACHE = 'lourex-invoice-v160';$/m);
  assert.ok(sw.includes('./styles/document-output-quality-v157.css'));
  assert.match(css,/\.invoice-page/);
  assert.doesNotMatch(css,/\.app-header|\.main-nav|\.editor-screen/);
});

test('v157 protects Arabic shaping from Latin tracking and casing',async()=>{
  const css=await read('src/styles/document-output-quality-v157.css');
  assert.match(css,/\[dir="rtl"\]/);
  assert.match(css,/font-family:var\(--font-arabic/);
  assert.match(css,/letter-spacing:0!important/);
  assert.match(css,/text-transform:none!important/);
  assert.match(css,/unicode-bidi:isolate!important/);
  assert.match(css,/font-variant-ligatures:common-ligatures contextual!important/);
  assert.match(css,/font-feature-settings:"rlig" 1,"calt" 1,"liga" 1!important/);
  assert.match(css,/word-break:normal!important/);
  assert.match(css,/overflow-wrap:normal!important/);
});

test('v157 gives signature and stamp materially stronger A4 presence',async()=>{
  const css=await read('src/styles/document-output-quality-v157.css');
  assert.match(css,/min-height:31mm!important/);
  assert.match(css,/signature-image\{[\s\S]*height:27mm!important/);
  assert.match(css,/stamp-image\{[\s\S]*height:30mm!important/);
  assert.match(css,/grid-template-columns:minmax\(0,1\.08fr\) minmax\(62mm,\.92fr\)!important/);
  assert.match(css,/object-fit:contain!important/);
});
