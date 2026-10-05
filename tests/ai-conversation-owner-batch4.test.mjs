import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('Batch 4 runs only after the unified Batch 3 conversation owner',async()=>{
  const [pkg,stage4]=await Promise.all([read('package.json'),read('scripts/ai-conversation-owner-stage4.mjs')]);
  const build=JSON.parse(pkg).scripts.build;
  const closeout=build.indexOf('ai-conversation-owner-stage3-closeout.mjs');
  const batch4=build.indexOf('ai-conversation-owner-stage4.mjs');
  assert.ok(closeout>=0,'Batch 3 closeout must remain in the build');
  assert.ok(batch4>closeout,'Batch 4 must run after Batch 3 closeout');
  assert.match(stage4,/__lourexPremiumConversationBatch3/);
  assert.match(stage4,/__lourexConversationComposerBatch3/);
  assert.doesNotMatch(stage4,/\/api\//,'UI-only Batch 4 must not introduce or reroute AI endpoints');
});

test('Batch 4 creates executive structured answers without changing calculation ownership',async()=>{
  const stage4=await read('scripts/ai-conversation-owner-stage4.mjs');
  for(const token of ['lourex-ai-kpi-grid','lourex-ai-answer-table','is-warning','is-recommendation','data-answer-block'])assert.match(stage4,new RegExp(token));
  assert.match(stage4,/__lourexInline\(instance/,'evidence-aware inline rendering must remain intact');
  assert.match(stage4,/var\(--lx485-blue,var\(--ft-accent\)\)/,'Batch 4 must use the canonical LOUREX accent token');
  assert.doesNotMatch(stage4,/#619dff|#3975e8|#0d0d0e|#b8a071/,'Batch 4 must not reintroduce competing hard-coded AI palettes');
});

test('approval proposals stay approval-gated and move into the conversation stream',async()=>{
  const [source,stage4]=await Promise.all([read('src/components/AiCopilot.tsx'),read('scripts/ai-conversation-owner-stage4.mjs')]);
  assert.match(source,/requiresApproval:true/,'existing mutation approvals must remain authoritative');
  assert.match(source,/approveProposal=async/,'existing approval executor must remain intact');
  assert.match(stage4,/lourex-ai-inline-action/);
  assert.match(stage4,/messageIndex>=0&&proposalIndex>=0/);
  assert.match(stage4,/lourex-ai-executive-proposal/);
  assert.doesNotMatch(stage4,/mutateVaultSafely|executeDocumentProposal|executeItemProposal/,'Batch 4 must not own data mutation');
});

test('desktop, mobile, RTL and touch contracts remain explicit',async()=>{
  const stage4=await read('scripts/ai-conversation-owner-stage4.mjs');
  assert.match(stage4,/width:min\(600px,calc\(100vw - 28px\)\)/);
  assert.match(stage4,/max-width:620px/);
  assert.match(stage4,/width:100vw/);
  assert.match(stage4,/height:100dvh/);
  assert.match(stage4,/\[dir='rtl'\]/);
  assert.match(stage4,/min-height:44px/);
});

test('workflow hub prioritizes primary tools and isolates history',async()=>{
  const stage4=await read('scripts/ai-conversation-owner-stage4.mjs');
  assert.match(stage4,/Start here/);
  assert.match(stage4,/Finance & execution/);
  assert.match(stage4,/Business intelligence/);
  assert.match(stage4,/History/);
  assert.match(stage4,/\[0,2,8,4\]/,'primary tools must be first');
  assert.match(stage4,/\[3\]/,'job history must be isolated from primary tools');
  assert.match(stage4,/buttons.length===12/,'reordering must fail closed when the existing hub shape changes');
});
