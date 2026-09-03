import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v153 introduces a deliberate premium application colour hierarchy',async()=>{
  const css=await read('src/styles/ux-recovery-v152.css');
  for(const token of ['--ux-navy-deep','--ux-blue-wash','--ux-ivory','--ux-champagne','--ux-shadow-strong'])assert.ok(css.includes(token),token);
  assert.match(css,/\.app-ui \.app-header\{[\s\S]*linear-gradient\(118deg,var\(--ux-navy-deep\)/);
  assert.match(css,/Page identity:[\s\S]*linear-gradient\(125deg,var\(--ux-navy-deep\)/);
  assert.match(css,/\.app-ui \.main-nav button\.active\{[^}]*background:#f7f1e6/);
  assert.match(css,/\.app-ui \.header-actions \.new-doc-menu>\.btn-primary\{[^}]*--ux-champagne/);
});

test('v153 differentiates content surfaces while keeping gold as an accent',async()=>{
  const css=await read('src/styles/ux-recovery-v152.css');
  assert.match(css,/product-library-row:nth-child\(even\)\{background:#edf3f4\}/);
  assert.match(css,/report-primary-metrics>div:first-child\{background:linear-gradient/);
  assert.match(css,/item-card header\{background:#e5eef1/);
  assert.match(css,/settings-tabs button\.active\{background:var\(--ux-navy\)!important/);
  assert.doesNotMatch(css,/\.app-ui\{[^}]*--ux-app:#fff[;}]/);
});

test('v153 remains isolated from printable A4 document styling',async()=>{
  const css=await read('src/styles/ux-recovery-v152.css');
  assert.doesNotMatch(css,/\n\.invoice-page/);
  assert.doesNotMatch(css,/\n\.document-page/);
  assert.match(css,/@media print\{[\s\S]*mobile-editor-actionbar\{display:none!important\}/);
});
