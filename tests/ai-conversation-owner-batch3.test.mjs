import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const stage=read('scripts/ai-conversation-owner-stage3.mjs');

test('Batch 3 runs after the canonical conversation owner',()=>{
  const build=String(pkg.scripts?.build||'');
  assert.match(build,/ai-conversation-owner\.mjs[\s\S]*ai-conversation-owner-stage3\.mjs/);
});

test('Batch 3 removes the duplicate workflow plus without breaking the voice bridge',()=>{
  assert.match(stage,/!plus&&!menu/);
  assert.match(stage,/plus\?\.remove\(\);mic\?\.remove\(\);status\?\.remove\(\);menu\?\.remove\(\)/);
  assert.match(stage,/nextMic\.addEventListener\('click',\(\)=>toggleVoice\(panel\)\)/);
  assert.match(stage,/__lourexConversationOwnerBatch3/);
  assert.match(stage,/lourex-ai-composer-plus,#lourex-ai-panel \.lourex-ai-plus-menu\{display:none!important/);
});

test('Batch 3 has one paperclip attachment control and a mobile bottom sheet',()=>{
  assert.match(stage,/className:'lourex-ai-attach-button'/);
  assert.match(stage,/M20\.5 11\.5 11 21/);
  assert.match(stage,/className:'lourex-ai-attachment-backdrop'/);
  assert.match(stage,/className:'lourex-ai-attachment-choice'/);
  assert.match(stage,/Add source/);
  assert.match(stage,/position:fixed!important;z-index:1491!important/);
  assert.match(stage,/bottom:calc\(8px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(stage,/border-radius:24px!important/);
  assert.match(stage,/lourex-ai-attach-button,#lourex-ai-panel \.lourex-ai-composer-mic,#lourex-ai-panel \.lourex-ai-send\{flex-basis:44px!important/);
  assert.match(stage,/__lourexConversationComposerBatch3/);
});
