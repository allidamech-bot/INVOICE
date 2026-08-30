import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v100 performance layer loads last in source, remains offline-capable, and preconnects critical third-party runtimes',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const styles=[...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  assert.equal(styles.at(-1),'performance-polish-v100.css');
  assert.match(sw,/const CACHE = 'lourex-invoice-v101'/);
  assert.match(sw,/\.\/styles\/performance-polish-v100\.css/);
  assert.match(html,/rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net" crossorigin/);
  assert.match(html,/rel="preconnect" href="https:\/\/www\.gstatic\.com" crossorigin/);
  assert.match(html,/rel="modulepreload" href="\.\/src\/app\/index\.js"/);
  assert.match(html,/rel="modulepreload" href="\.\/src\/app\/App\.js"/);
});

test('v100 skips off-screen list rendering and disables costly touch-device backdrop sampling',async()=>{
  const css=await read('src/styles/performance-polish-v100.css');
  assert.match(css,/@supports \(content-visibility:auto\)/);
  assert.match(css,/\.premium-document-card[\s\S]*?content-visibility:auto/);
  assert.match(css,/\.customer-card[\s\S]*?content-visibility:auto/);
  assert.match(css,/\.saved-item-row[\s\S]*?content-visibility:auto/);
  assert.match(css,/@media \(pointer:coarse\)/);
  assert.match(css,/backdrop-filter:none!important/);
  assert.match(css,/@keyframes v100-backdrop-in[\s\S]*?background-color/);
  const backdropFrames=css.match(/@keyframes v100-backdrop-in\{[\s\S]*?\n\}/)?.[0]||'';
  assert.doesNotMatch(backdropFrames,/backdrop-filter/);
});

test('v100 remains application-only and does not restyle printable invoice content',async()=>{
  const css=await read('src/styles/performance-polish-v100.css');
  assert.doesNotMatch(css,/\.invoice-page\s*\{/);
  assert.doesNotMatch(css,/\.items-table\s*\{/);
  assert.doesNotMatch(css,/\.doc-body\s*\{/);
});
