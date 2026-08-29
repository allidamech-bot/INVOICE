import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const editorCss='src/styles/editor-system.css';

test('final editor system is loaded last and shipped by the PWA cache',async()=>{
  const [html,sw,css]=await Promise.all([read('index.html'),read('public/sw.js'),read(editorCss)]);
  const editorIndex=html.indexOf('editor-system.css');
  const previousIndex=html.indexOf('v44-audit.css');
  assert.ok(editorIndex>previousIndex,'editor system must remain the final application stylesheet');
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/styles\/editor-system\.css/);
  assert.ok(css.length<26000,'consolidated editor layer should remain focused');
});

test('mobile editor preserves touch usability and iOS safe areas',async()=>{
  const css=await read(editorCss);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/font-size:16px/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/100dvh/);
  assert.match(css,/scroll-padding-top/);
  assert.match(css,/mobile-editor-actionbar/);
});

test('editor polish does not style printable A4 template internals',async()=>{
  const css=await read(editorCss);
  assert.doesNotMatch(css,/\.a4[-_]/i);
  assert.doesNotMatch(css,/\.document-page/i);
  assert.doesNotMatch(css,/\.invoice-page/i);
  assert.match(css,/\.app-ui \.editor-screen/);
  assert.match(css,/prefers-reduced-motion/);
});

test('desktop split preview and centered tablet workspace remain intact',async()=>{
  const css=await read(editorCss);
  assert.match(css,/grid-template-columns:minmax\(430px,44%\) minmax\(0,56%\)/);
  assert.match(css,/@media\(max-width:1180px\)/);
  assert.match(css,/width:min\(100%,820px\)/);
  assert.match(css,/\.preview-stage\{padding:26px 30px 80px\}/);
});
