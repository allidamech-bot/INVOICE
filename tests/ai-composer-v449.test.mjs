import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const index=read('index.html');
const css=read('public/ai-composer-v449.css');
const js=read('public/ai-composer-v449.js');
const vercel=read('vercel.json');

test('v449 loads the chat-style composer after AI workflow bridge',()=>{
  assert.match(index,/ai-composer-v449\.css\?v=449-1/);
  assert.match(index,/lourex-ai-workflows\.js\?v=1[\s\S]*ai-composer-v449\.js\?v=449-1/);
  assert.match(css,/\.lourex-ai-composer-plus/);
  assert.match(css,/\.lourex-ai-composer-mic/);
  assert.match(css,/\.lourex-ai-plus-menu/);
  assert.match(css,/\[data-lourex-ai-workflow-mount\]>\.lourex-ai-tools/);
});

test('v449 plus menu contains the major LOUREX AI workflows without a launcher grid',()=>{
  for(const token of ['AI Inbox','File → Quotation','Product AI','Supplier AI','Ask Anything','Collections','CFO','Compare Supplier Offers','What matters today','Business Memory','Accounting Guardian','AI Job History'])assert.ok(js.includes(token),`missing ${token}`);
  assert.match(js,/routeThroughWorkflowMenu\(1\)/);
  assert.match(js,/routeThroughWorkflowMenu\(10\)/);
  assert.match(js,/routeThroughWorkflowMenu\(11\)/);
  assert.match(js,/lourex-ai-open-business-search/);
  assert.match(js,/lourex-ai-open-procurement/);
});

test('v449 voice control exposes a visible listening state and first-party microphone policy',()=>{
  assert.match(js,/aria-pressed/);
  assert.match(js,/Listening… tap the microphone to stop/);
  assert.match(js,/جارٍ الاستماع… اضغط الميكروفون للإيقاف/);
  assert.match(css,/\.lourex-ai-composer-mic\.is-listening/);
  assert.match(css,/lourexAiListenPulse/);
  assert.match(vercel,/microphone=\(self\)/);
  assert.doesNotMatch(vercel,/microphone=\(\)/);
});
