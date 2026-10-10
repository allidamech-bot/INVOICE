import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile('src/styles/editor-system.css','utf8');
const html = await readFile('index.html','utf8');
const sw = await readFile('public/sw.js','utf8');
const distSw = await readFile('dist/sw.js','utf8');

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

test('current editor frame and core replace retired mobile editor layers and ship offline',()=>{
 for(const css of ['tailadmin-editor-frame-v320.css','tailadmin-editor-core-v320.css'])assert.ok(html.includes(css),css);
 assert.doesNotMatch(html,/mobile-editor-fixes\.css|editor-premium-v56\.css/);
 assert.ok(sw.includes("lourex-invoice-v"));
 assert.ok(distSw.includes('styles/app.bundle.css'),'the generated PWA cache includes its stylesheet bundle');
});

