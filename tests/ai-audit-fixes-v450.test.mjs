import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v450 AI audit fixes load after the v449 composer runtime',async()=>{
  const index=await read('index.html');
  assert.match(index,/ai-composer-v449\.css\?v=449-1[\s\S]*ai-audit-fixes-v450\.css\?v=450-1/);
  assert.match(index,/ai-composer-v449\.js\?v=449-1[\s\S]*ai-audit-fixes-v450\.js\?v=450-1/);
});

test('v450 voice capture preserves interim iPhone speech and treats manual abort as stop',async()=>{
  const source=await read('public/ai-audit-fixes-v450.js');
  assert.match(source,/instance\.interimResults=true/);
  assert.match(source,/latestTranscript=transcript;renderTranscript\(panel\)/);
  assert.match(source,/manualStop&&\(code==='aborted'\|\|code==='no-speech'\)/);
  assert.match(source,/event\.stopImmediatePropagation\(\)/);
  assert.match(source,/Safari could not reach the speech-recognition service/);
});

test('v450 replaces robot identity with the official LOUREX app mark',async()=>{
  const source=await read('public/ai-audit-fixes-v450.js');
  const css=await read('public/ai-audit-fixes-v450.css');
  assert.match(source,/\.\/brand\/lourex-app-icon\.svg/);
  assert.match(source,/lourex-ai-brand-mark-v450/);
  assert.match(source,/lourex-ai-brand-launcher-v450/);
  assert.match(css,/\.lourex-ai-brand-icon-v450/);
});

test('v450 plus menu has semantic premium color treatments without changing workflow labels',async()=>{
  const source=await read('public/ai-audit-fixes-v450.js');
  const css=await read('public/ai-audit-fixes-v450.css');
  for(const label of ['AI Inbox','File → Quotation','Product AI','Supplier AI','Ask Anything','Collections','Compare Supplier Offers','CFO','What matters today','Business Memory','Accounting Guardian'])assert.ok(source.includes(label),`missing semantic label ${label}`);
  for(const tone of ['blue','violet','emerald','amber','sky','teal','indigo','gold','rose','purple','red'])assert.match(css,new RegExp(`data-ai-tone="${tone}"`));
  assert.match(css,/color-mix\(in srgb,var\(--ai-tone\)/);
});
