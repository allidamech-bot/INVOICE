import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile('src/styles/editor-system.css','utf8');
const html = await readFile('index.html','utf8');
const sw = await readFile('public/sw.js','utf8');

test('mobile item section actions keep their responsive layout',()=>{
  assert.match(css,/\.section-heading\.with-action\{[^}]*flex-direction:column/);
  assert.match(css,/\.section-heading-actions\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.section-heading-actions \.btn\{[^}]*width:100%/);
});

test('grand total keeps explicit high-contrast foreground',()=>{
  assert.match(css,/\.editor-totals \.grand\{[^}]*background:linear-gradient/);
  assert.match(css,/\.editor-totals \.grand span,[^}]*\.editor-totals \.grand strong\{[^}]*color:#fff!important/);
});

test('mobile controls retain larger touch targets and spacing',()=>{
  assert.match(css,/\.app-ui \.input,[^}]*min-height:44px/);
  assert.match(css,/textarea\.input\{[^}]*min-height:92px/);
  assert.match(css,/\.adjustment-row\{[^}]*min-height:54px/);
});

test('legacy final editor layers are replaced by one cached final stylesheet',()=>{
  assert.match(html,/v44-audit\.css[^]*editor-system\.css/);
  assert.doesNotMatch(html,/mobile-editor-fixes\.css|editor-premium-v56\.css/);
  assert.match(sw,/lourex-invoice-v57/);
  assert.match(sw,/\.\/styles\/editor-system\.css/);
  assert.doesNotMatch(sw,/mobile-editor-fixes\.css|editor-premium-v56\.css/);
});
