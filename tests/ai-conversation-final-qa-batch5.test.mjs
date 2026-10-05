import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const runner=read('tests/visual/run-contextual-ai-batch4.cjs');
const voice=read('tests/visual/run-ai-voice-reliability-batch5.cjs');
const accessibility=read('scripts/ai-conversation-owner-stage4-accessibility.mjs');
const workflow=read('.github/workflows/ai-conversation-final-qa-batch5.yml');

test('final AI conversation QA covers priority phone, tablet and desktop widths',()=>{
  for(const token of ["[320,'ar','dark']","[390,'en','light']","[820,'ar','light']","[1440,'en','dark']"])assert.match(runner,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(runner,/safari\?\[\[320,'ar','dark'\],\[390,'en','light'\],\[820,'ar','light'\]\]/);
  assert.match(runner,/phone AI is full width/);
  assert.match(runner,/tablet-compact AI remains a bounded overlay/);
  assert.match(runner,/desktop AI remains a side panel/);
  assert.match(runner,/horizontal overflow/);
});

test('Tools keyboard and touch contracts are exercised end to end',()=>{
  for(const token of ['ArrowDown','ArrowUp','Home','End','Escape','44px target','returns focus to Tools trigger'])assert.match(runner,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const token of ['ArrowDown','ArrowUp','Home','End','Escape','safe-area-inset-bottom'])assert.match(accessibility,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(runner,/Tools menu remains inside viewport/);
  assert.match(runner,/opening Tools moves focus to first action/);
});

test('final QA keeps attachments, memory, proactive brief, scopes and repeated voice in the same acceptance pass',()=>{
  for(const token of ['source.txt','Memory & Tasks','Morning Brief','Shift+Enter'])assert.match(runner,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  for(const token of ['sessions:8','overlappingStarts:0','unifiedAssistant','naturalLanguageOs'])assert.match(voice,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('dedicated final workflow runs contracts plus Chromium and WebKit conversation journeys',()=>{
  assert.match(workflow,/AI Conversation Final QA/);
  assert.match(workflow,/node --test tests\/ai-conversation-final-qa-batch5\.test\.mjs/);
  assert.match(workflow,/node tests\/visual\/run-contextual-ai-batch4\.cjs/);
  assert.match(workflow,/LOUREX_QA_BROWSER=webkit node tests\/visual\/run-contextual-ai-batch4\.cjs/);
  assert.match(workflow,/node tests\/visual\/run-ai-voice-reliability-batch5\.cjs/);
  assert.match(workflow,/playwright install --with-deps chromium webkit/);
});
