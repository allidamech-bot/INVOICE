import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile('src/styles/mobile-editor-fixes.css','utf8');
const html = await readFile('index.html','utf8');
const sw = await readFile('public/sw.js','utf8');

test('mobile item section actions wrap into a dedicated responsive layout',()=>{
  assert.match(css,/\.section-heading\.with-action\{[\s\S]*flex-direction:column/);
  assert.match(css,/\.section-heading-actions\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.section-heading-actions \.btn\{[\s\S]*width:100%/);
});

test('grand total uses explicit high-contrast foreground on the dark surface',()=>{
  assert.match(css,/\.editor-totals \.grand\{[\s\S]*background:linear-gradient/);
  assert.match(css,/\.editor-totals \.grand span,[\s\S]*\.editor-totals \.grand strong\{[\s\S]*color:#fff!important/);
});

test('mobile controls receive larger touch targets and spacing',()=>{
  assert.match(css,/\.app-ui \.input,[\s\S]*min-height:44px/);
  assert.match(css,/textarea\.input\{[\s\S]*min-height:92px/);
  assert.match(css,/\.adjustment-row\{[\s\S]*min-height:54px/);
});

test('v47 stylesheet is loaded last and cached for offline PWA use',()=>{
  assert.match(html,/v44-audit\.css[^]*mobile-editor-fixes\.css/);
  assert.match(sw,/lourex-invoice-v47/);
  assert.match(sw,/\.\/styles\/mobile-editor-fixes\.css/);
});
