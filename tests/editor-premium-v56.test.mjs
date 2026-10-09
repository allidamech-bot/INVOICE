import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const editorCss='src/styles/editor-system.css';

test('approved TailAdmin editor frame and core load in order with offline CSS bundling',async()=>{
 const [html,distSw,frame,core]=await Promise.all([read('index.html'),read('dist/sw.js'),read('src/styles/tailadmin-editor-frame-v320.css'),read('src/styles/tailadmin-editor-core-v320.css')]);
 const frameIndex=html.indexOf('tailadmin-editor-frame-v320.css'),coreIndex=html.indexOf('tailadmin-editor-core-v320.css');
 assert.ok(frameIndex>=0&&coreIndex>frameIndex,'editor frame must precede editor core');
 assert.ok(distSw.includes('styles/app.bundle.css'),'installed clients need the production CSS bundle');
 assert.ok(frame.includes('.ta-editor-step-nav'));
 assert.ok(core.includes('safe-area-inset-bottom'));
 assert.doesNotMatch(frame,/\.invoice-page/);
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
