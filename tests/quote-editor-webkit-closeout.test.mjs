import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('final quote editor visual gate includes WebKit iPhone and iPad coverage',async()=>{
  const runner=await read('tests/visual/run-mobile-final-quote-stack.cjs');
  assert.match(runner,/\{ chromium, webkit \} = require\('playwright'\)/,'final quote stack must run with WebKit in addition to Chromium');
  assert.match(runner,/name:'webkit', engine:webkit/,'WebKit must be an explicit final-quote QA engine');
  assert.match(runner,/width:390, height:844, kind:'phone'/,'WebKit coverage must include the compact iPhone viewport');
  assert.match(runner,/width:820, height:1180, kind:'tablet'/,'WebKit coverage must include the primary iPad viewport');
  assert.match(runner,/width:1024, height:1366, kind:'tablet'/,'WebKit coverage must include the large iPad viewport');
  assert.match(runner,/native Safari date text is still visible/,'WebKit final quote QA must retain the Safari date-display regression assertion');
  assert.match(runner,/Create Invoice CTA is hidden or below the 44px touch target/,'WebKit final quote QA must retain the conversion CTA touch-target assertion');
});
