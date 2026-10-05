import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const stage=read('scripts/ai-conversation-owner-stage3.mjs');
const closeout=read('scripts/ai-conversation-owner-stage3-closeout.mjs');
const tailadmin=read('tests/visual/run-tailadmin-v320.cjs');

test('Batch 3 runs after the canonical conversation owner and closes out last',()=>{
  const build=String(pkg.scripts?.build||'');
  assert.match(build,/ai-conversation-owner\.mjs[\s\S]*ai-conversation-owner-stage3\.mjs[\s\S]*ai-conversation-owner-stage3-closeout\.mjs/);
});

test('Batch 3 keeps the unified plus in the React tree and preserves the v449 voice bridge',()=>{
  assert.doesNotMatch(stage,/!plus&&!menu/,'the + gateway and menu remain part of the completeness contract');
  assert.match(stage,/const complete=form\.dataset\.lourexAiComposerV449==='true'&&plus instanceof HTMLButtonElement&&mic instanceof HTMLButtonElement&&status instanceof HTMLElement&&menu instanceof HTMLElement/);
  assert.match(stage,/removeControlsToken/,'stage3 explicitly owns the runtime refresh mutation');
  assert.match(stage,/mic\?\.remove\(\);status\?\.remove\(\);menu\?\.remove\(\)/,'runtime refresh removes only runtime-owned controls');
  assert.doesNotMatch(stage,/composer\.replace\(removeControlsToken,"plus\?\.remove/,'React-owned + must never be removed by the runtime owner');
  assert.match(stage,/className:'lourex-ai-composer-plus'/,'the visible + is emitted in the React tree');
  assert.match(stage,/lourex-ai-toggle-plus/,'the React + uses a stable event bridge to the v449 menu owner');
  assert.match(stage,/nextMenu\.className='lourex-ai-plus-menu'/,'the v449 runtime still owns the menu surface');
  assert.match(stage,/nextMic\.addEventListener\('click',\(\)=>toggleVoice\(panel\)\)/);
  assert.match(stage,/class="lourex-ai-voice-retry" hidden/,'voice retry control survives composer consolidation');
  assert.match(stage,/voiceRetry\.addEventListener\('click',\(\)=>toggleVoice\(panel\)\)/,'voice retry restarts the canonical recognizer');
  assert.match(stage,/__lourexConversationOwnerBatch3/);
});

test('Batch 3 keeps attachment inputs as hidden bridges behind the unified plus menu',()=>{
  assert.match(stage,/function __lourexAttachmentMenu\(instance\)\{return null;\}/,'duplicate React attachment menu is retired');
  assert.match(stage,/__lourexFileInput/);
  assert.match(stage,/__lourexCameraInput/);
  assert.match(stage,/className:'lourex-ai-composer-plus'/);
  assert.match(stage,/lourex-ai-plus-menu/);
  assert.match(stage,/__lourexConversationComposerBatch3/);
});

test('Batch 3 closeout is visual-only and does not replace AiCopilot close ownership',()=>{
  assert.doesNotMatch(closeout,/AiCopilot\.prototype/,'deep-QA closeout must not wrap React lifecycle or render ownership');
  assert.doesNotMatch(closeout,/setState\(/,'deep-QA closeout must not introduce a second close-state owner');
  assert.doesNotMatch(closeout,/querySelectorAll\('\.lourex-ai-backdrop'\)/,'deep-QA closeout must not hide production overlays through diagnostic DOM mutation');
  assert.match(closeout,/production close behavior must therefore remain owned by[\s\S]*AiCopilot/);
});

test('Batch 3 closeout keeps the send action on v485 tokens and preserves 44px narrow-phone targets',()=>{
  assert.match(closeout,/const cssTarget='dist\/ai-composer-v449\.css'/);
  assert.match(closeout,/background:var\(--lx485-blue,var\(--ft-accent\)\)!important/,'send action must resolve through the canonical LOUREX accent token before the final conversation palette owner');
  assert.match(closeout,/flex-basis:44px!important;width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important/,'narrow-phone controls must remain full 44px targets');
  assert.match(closeout,/#619dff\|#3975e8\|rgba\\\(168,202,255\|rgba\\\(47,106,224/,'closeout must reject the competing hard-coded blue treatment');
});

test('TailAdmin mobile QA recognizes the unified plus composer',()=>{
  assert.match(tailadmin,/panel\.waitFor\(\{state:'attached'/);
  assert.match(tailadmin,/lourex-ai-composer-plus/);
  assert.match(tailadmin,/el\.dataset\.v449QaReady='true'/);
  assert.match(tailadmin,/LOUREX AI plus target/);
});
