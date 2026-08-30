import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('mobile shell loads and caches pull-to-refresh assets',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  assert.match(html,/styles\/pull-to-refresh-v86\.css/);
  assert.match(html,/<script src="\.\/pull-to-refresh\.js"><\/script>/);
  assert.match(sw,/\.\/pull-to-refresh\.js/);
  assert.match(sw,/\.\/styles\/pull-to-refresh-v86\.css/);
  assert.match(sw,/lourex-invoice-v\d+/);
});

test('pull-to-refresh only installs the blocking touchmove listener during an active pull gesture',async()=>{
  const script=await read('public/pull-to-refresh.js');
  assert.doesNotThrow(()=>new Function(script));
  assert.match(script,/const THRESHOLD=76/);
  assert.match(script,/window\.scrollY<=0/);
  assert.match(script,/\.app-root \.app-ui/);
  assert.match(script,/\.modal-backdrop,\.mobile-preview-overlay,\.editor-main,\.editor-screen/);
  assert.match(script,/const attachMoveListener=/);
  assert.match(script,/window\.addEventListener\('touchmove',onMove,\{passive:false\}\)/);
  assert.match(script,/const detachMoveListener=/);
  assert.match(script,/window\.removeEventListener\('touchmove',onMove\)/);
  assert.match(script,/attachMoveListener\(\)/);
  assert.match(script,/event\.preventDefault\(\)/);
  assert.match(script,/requestAnimationFrame\(renderPaint\)/);
  assert.match(script,/refreshing\?'refreshing':distance>=THRESHOLD\?'ready':'pull'/);
  assert.match(script,/registration\.update\(\)/);
  assert.match(script,/window\.location\.reload\(\)/);
  const tail=script.slice(script.lastIndexOf("window.addEventListener('touchstart'"));
  assert.doesNotMatch(tail,/addEventListener\('touchmove'/);
});

test('pull-to-refresh visual feedback respects iPhone safe areas and never prints',async()=>{
  const css=await read('src/styles/pull-to-refresh-v86.css');
  assert.match(css,/env\(safe-area-inset-top/);
  assert.match(css,/\.lourex-pull-refresh\.is-ready/);
  assert.match(css,/\.lourex-pull-refresh\.is-refreshing/);
  assert.match(css,/@media print/);
  assert.match(css,/display:none!important/);
});