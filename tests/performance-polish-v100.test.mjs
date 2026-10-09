import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v100 remains the final app layer beneath the isolated document system',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const styles=[...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  assert.ok(styles.indexOf('performance-polish-v100.css')<styles.indexOf('document-premium-redesign-v141.css'));
  // Active TailAdmin workspaces load after the legacy print owner. Enforce
  // isolation at stylesheet boundaries rather than obsolete last-link order.
  const [print,activeApp]=await Promise.all([
    read('src/styles/document-premium-redesign-v141.css'),
    read('src/styles/tailadmin-reliability-bridge-v320.css')
  ]);
  assert.match(html,/tailadmin-reliability-bridge-v320\.css/);
  assert.match(activeApp,/@media screen/);
  assert.doesNotMatch(activeApp,/@media print|\.invoice-page\s*\{/);
  assert.match(print,/invoice-page|@media print/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v101'/);
  assert.match(sw,/\.\/styles\/performance-polish-v100\.css/);
  assert.match(html,/rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net" crossorigin/);
  assert.match(html,/rel="preconnect" href="https:\/\/www\.gstatic\.com" crossorigin/);
  assert.match(html,/rel="modulepreload" href="\.\/src\/app\/index\.js"/);
  assert.match(html,/rel="modulepreload" href="\.\/src\/app\/App\.js"/);
});

test('v100 retains off-screen paint optimizations and avoids touch compositor churn',async()=>{
  const css=await read('src/styles/performance-polish-v100.css');
  assert.match(css,/@supports \(content-visibility:auto\)/);
  for(const selector of ['.premium-document-card','.customer-card','.saved-item-row','.ta-doc-row','.ta-customer-row','.ta-product-row']){
    assert.ok(css.includes(selector),selector+' must retain off-screen rendering optimization');
  }
  assert.match(css,/content-visibility:auto/);
  assert.match(css,/contain-intrinsic-size:auto 76px/);
  assert.match(css,/@media \(pointer:coarse\)/);
  assert.match(css,/\.editor-topbar,\.preview-toolbar/);
  assert.match(css,/transform:none/);
  assert.match(css,/backface-visibility:visible/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css,/transition:none!important/);
  assert.doesNotMatch(css,/backdrop-filter|@keyframes/,
    'performance stylesheet must not reintroduce expensive animations or take over visual backgrounds');
});

test('v100 remains application-only and does not restyle printable invoice content',async()=>{
  const css=await read('src/styles/performance-polish-v100.css');
  assert.doesNotMatch(css,/\.invoice-page\s*\{/);
  assert.doesNotMatch(css,/\.items-table\s*\{/);
  assert.doesNotMatch(css,/\.doc-body\s*\{/);
});
