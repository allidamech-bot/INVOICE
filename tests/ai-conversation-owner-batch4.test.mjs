import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const stage=read('scripts/ai-conversation-owner-stage4.mjs');

test('Batch 4 runs after the canonical Batch 3 owner and stays in the existing assistant',()=>{
  const build=String(pkg.scripts?.build||'');
  assert.match(build,/ai-conversation-owner-stage3-closeout\.mjs[\s\S]*ai-conversation-owner-stage4\.mjs/);
  assert.match(stage,/__lourexToolOrchestratorBatch4/,'existing approval-gated tool orchestrator must remain the execution owner');
  assert.match(stage,/__lourexConversationComposerBatch3/,'Batch 4 must build on the unified composer');
  assert.match(stage,/__lourexConversationOwnerBatch4/);
  assert.doesNotMatch(stage,/AiCopilot\.prototype\./,'Batch 4 must not install another render owner');
  assert.doesNotMatch(stage,/document-render|template|pdf/i,'Batch 4 must not touch document rendering or PDF/template ownership');
});

test('Batch 4 upgrades the single Tools hub without adding persistent duplicate launchers',()=>{
  for(const token of ['lourex-ai-tools-menu','aria-controls','aria-haspopup','dataset.toolKey','lourex-ai-hub-action-icon','lourex-ai-hub-action-copy'])assert.match(stage,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(stage,/AI Inbox/);
  assert.match(stage,/AI Tools/);
  assert.match(stage,/Memory & Tasks/);
  assert.match(stage,/Morning Brief/);
  assert.match(stage,/صندوق AI/);
  assert.match(stage,/الذاكرة والمهام/);
  assert.doesNotMatch(stage,/lourex-ai-manager-button.*display\s*:\s*(?:block|flex|grid)/,'Batch 4 must not restore the old persistent Memory launcher');
});

test('Batch 4 decoration is idempotent and language-aware',()=>{
  assert.match(stage,/menu\.dataset\.premiumOwner==='4'/);
  assert.match(stage,/menu\.dataset\.premiumLanguage===language/);
  assert.match(stage,/menu\.dataset\.premiumOwner='4'/);
  assert.match(stage,/menu\.dataset\.premiumLanguage=language/);
});

test('Batch 4 adds keyboard ownership and returns focus on Escape',()=>{
  assert.match(stage,/event\.key==='ArrowDown'/);
  assert.match(stage,/event\.key==='ArrowUp'/);
  assert.match(stage,/event\.key==='Home'/);
  assert.match(stage,/event\.key==='End'/);
  assert.match(stage,/event\.key==='Escape'/);
  assert.match(stage,/trigger\.click\(\);trigger\.focus\(\)/);
  assert.match(stage,/first\.focus\(\)/,'opening Tools should move keyboard focus into the menu');
});

test('Batch 4 keeps premium conversation hierarchy tokenized and mobile-safe',()=>{
  for(const token of ['--lx485-line','--lx485-blue','--lx485-surface-2','--lx485-text','lourex-ai-message.assistant','lourex-ai-message.user','lourex-ai-proposal','lourex-ai-preview','lourex-ai-thread-picker'])assert.match(stage,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(stage,/bottom:calc\(8px \+ env\(safe-area-inset-bottom,0px\)\)!important/,'mobile Tools sheet must honor the bottom safe area');
  assert.match(stage,/lourex-ai-history-button,.lourex-ai-hub-trigger\)\{min-height:44px!important;height:44px!important/,'mobile navigation controls must retain 44px targets');
  assert.match(stage,/lourex-ai-thread-search,#lourex-ai-panel \.lourex-ai-thread-open,#lourex-ai-panel \.lourex-ai-proposal-actions button\{min-height:44px!important/,'mobile history and approval targets must retain 44px targets');
  assert.match(stage,/font-variant-numeric:tabular-nums!important/,'action previews should keep financial numbers aligned');
});
