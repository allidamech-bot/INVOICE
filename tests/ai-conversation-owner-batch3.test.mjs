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

test('Batch 3 preserves the unified plus gateway without breaking the voice bridge',()=>{
  assert.doesNotMatch(stage,/!plus&&!menu/,'the + gateway and menu must remain part of the completeness contract');
  assert.match(stage,/const complete=form\.dataset\.lourexAiComposerV449==='true'&&plus instanceof HTMLButtonElement&&mic instanceof HTMLButtonElement&&status instanceof HTMLElement&&menu instanceof HTMLElement/);
  assert.match(stage,/const createStart="const nextPlus=document\.createElement\('button'\);"/,'installer must still identify the canonical composer construction block');
  assert.match(stage,/nextPlus\.className='lourex-ai-composer-plus'/,'the unified + control must be recreated by the final composer owner');
  assert.match(stage,/nextMenu\.className='lourex-ai-plus-menu'/,'the unified + menu must survive the final composer owner');
  assert.match(stage,/nextMic\.addEventListener\('click',\(\)=>toggleVoice\(panel\)\)/);
  assert.match(stage,/class="lourex-ai-voice-retry" hidden/,'voice retry control must survive composer consolidation');
  assert.match(stage,/voiceRetry\.addEventListener\('click',\(\)=>toggleVoice\(panel\)\)/,'voice retry must restart the canonical recognizer');
  assert.match(stage,/__lourexConversationOwnerBatch3/);
  assert.match(stage,/lourex-ai-attach-button,#lourex-ai-panel \.lourex-ai-attachment-menu,#lourex-ai-panel \.lourex-ai-attachment-backdrop\{display:none!important/,'duplicate attachment chrome is visually retired');
});

test('Batch 3 keeps attachment inputs as a hidden bridge behind the unified plus menu',()=>{
  assert.match(stage,/className:'lourex-ai-attach-button'/,'legacy React bridge remains available for compatibility');
  assert.match(stage,/__lourexFileInput/);
  assert.match(stage,/__lourexCameraInput/);
  assert.match(stage,/className:'lourex-ai-attachment-choice'/,'attachment fallback remains wired even though its chrome is hidden');
  assert.match(stage,/lourex-ai-composer-plus/);
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
