import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const stage=read('scripts/ai-conversation-owner-stage3.mjs');
const closeout=read('scripts/ai-conversation-owner-stage3-closeout.mjs');

test('Batch 3 runs after the canonical conversation owner and closes out last',()=>{
  const build=String(pkg.scripts?.build||'');
  assert.match(build,/ai-conversation-owner\.mjs[\s\S]*ai-conversation-owner-stage3\.mjs[\s\S]*ai-conversation-owner-stage3-closeout\.mjs/);
});

test('Batch 3 removes the duplicate workflow plus without breaking the voice bridge',()=>{
  assert.match(stage,/!plus&&!menu/);
  assert.match(stage,/const createStart="const nextPlus=document\.createElement\('button'\);"/,'installer must identify and replace the legacy plus construction block');
  assert.match(stage,/nextMic\.addEventListener\('click',\(\)=>toggleVoice\(panel\)\)/);
  assert.match(stage,/class=\"lourex-ai-voice-retry\" hidden/,'voice retry control must survive composer consolidation');
  assert.match(stage,/voiceRetry\.addEventListener\('click',\(\)=>toggleVoice\(panel\)\)/,'voice retry must restart the canonical recognizer');
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

test('Batch 3 close and backdrop bind to the currently rendered advisor instance',()=>{
  assert.match(closeout,/__lourexConversationCloseoutBatch3/);
  assert.match(closeout,/instance\.cancelRequest\?\.\(\)/);
  assert.match(closeout,/attachmentMenuOpen:false/);
  assert.match(closeout,/instance\.setState\(\{open:false,busy:false,error:'',proposal:null,attachmentMenuOpen:false\}\)/);
  assert.match(closeout,/className==='lourex-ai-backdrop'\|\|className\.includes\('lourex-ai-close'\)/);
  assert.doesNotMatch(closeout,/instance\.__lourexCloseCapture\s*=/,'Close must not install stale document-level capture ownership');
  assert.match(closeout,/if\(source\.includes\("document\.addEventListener\('click',instance\.__lourexCloseCapture,true\)"\)\)throw/,'closeout must retain the guard that rejects a document capture listener');
});

test('Batch 3 closeout keeps the send action on v485 tokens and preserves 44px narrow-phone targets',()=>{
  assert.match(closeout,/const cssTarget='dist\/ai-composer-v449\.css'/);
  assert.match(closeout,/background:var\(--lx485-blue,var\(--ft-accent\)\)!important/,'send action must resolve through the canonical LOUREX accent token');
  assert.match(closeout,/flex-basis:44px!important;width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important/,'narrow-phone controls must remain full 44px targets');
  assert.match(closeout,/#619dff\|#3975e8\|rgba\\\(168,202,255\|rgba\\\(47,106,224/,'closeout must reject the competing hard-coded blue treatment');
});
