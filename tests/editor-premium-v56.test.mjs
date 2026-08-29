import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v56 editor layer is loaded last and shipped by the PWA cache',async()=>{
  const [html,sw,css]=await Promise.all([
    read('index.html'),
    read('public/sw.js'),
    read('src/styles/editor-premium-v56.css')
  ]);
  const premiumIndex=html.indexOf('editor-premium-v56.css');
  const previousIndex=html.indexOf('mobile-editor-fixes.css');
  assert.ok(premiumIndex>previousIndex,'v56 editor layer must load after legacy editor fixes');
  assert.match(sw,/lourex-invoice-v56/);
  assert.match(sw,/styles\/editor-premium-v56\.css/);
  assert.ok(css.length<22000,'editor override should remain focused rather than becoming another oversized style layer');
});

test('v56 mobile editor preserves touch usability and iOS safe areas',async()=>{
  const css=await read('src/styles/editor-premium-v56.css');
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/font-size:16px/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/100dvh/);
  assert.match(css,/scroll-padding-top/);
  assert.match(css,/mobile-editor-actionbar/);
});

test('v56 editor polish does not style printable A4 template internals',async()=>{
  const css=await read('src/styles/editor-premium-v56.css');
  assert.doesNotMatch(css,/\.a4[-_]/i);
  assert.doesNotMatch(css,/\.document-page/i);
  assert.doesNotMatch(css,/\.invoice-page/i);
  assert.match(css,/\.app-ui \.editor-screen/);
  assert.match(css,/prefers-reduced-motion/);
});

test('v56 keeps desktop split preview while making tablet editor a centered single workspace',async()=>{
  const css=await read('src/styles/editor-premium-v56.css');
  assert.match(css,/grid-template-columns:minmax\(430px,44%\) minmax\(0,56%\)/);
  assert.match(css,/@media\(max-width:1180px\)/);
  assert.match(css,/width:min\(100%,820px\)/);
  assert.match(css,/\.preview-stage\{padding:26px 30px 80px\}/);
});
