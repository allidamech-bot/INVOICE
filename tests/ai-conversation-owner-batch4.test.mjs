import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('Batch 4 runs only after the unified Batch 3 conversation owner',async()=>{
  const [pkg,stage4]=await Promise.all([read('package.json'),read('scripts/ai-conversation-owner-stage4.mjs')]);
  const build=JSON.parse(pkg).scripts.build;
  const closeout=build.indexOf('ai-conversation-owner-stage3-closeout.mjs');
  const tools=build.indexOf('ai-conversation-owner-stage4-tools.mjs');
  const toolsCloseout=build.indexOf('ai-conversation-owner-stage4-tools-closeout.mjs');
  const executive=build.indexOf('ai-conversation-owner-stage4.mjs');
  const accessibility=build.indexOf('ai-conversation-owner-stage4-accessibility.mjs');
  assert.ok(closeout>=0,'Batch 3 closeout must remain in the build');
  assert.ok(tools>closeout&&toolsCloseout>tools&&executive>toolsCloseout&&accessibility>executive,'Batch 4 owners must run once in the canonical order after Batch 3 closeout');
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

test('approval proposals stay approval-gated inside the canonical conversation owner chain',async()=>{
  const [source,tools,closeout,stage4]=await Promise.all([
    read('src/components/AiCopilot.tsx'),
    read('scripts/ai-conversation-owner-stage4-tools.mjs'),
    read('scripts/ai-conversation-owner-stage4-tools-closeout.mjs'),
    read('scripts/ai-conversation-owner-stage4.mjs')
  ]);
  assert.match(source,/requiresApproval:true/,'existing mutation approvals must remain authoritative');
  assert.match(source,/approveProposal=async/,'existing approval executor must remain intact');
  assert.match(tools,/lourex-ai-tool-approval/,'Batch 4 must render approvals in the existing conversation surface');
  assert.match(tools,/__lourexApprovePlanStep/,'multi-step plans must advance one approved step at a time');
  assert.match(tools,/applyApprovedToolExecution\(step\)/,'generic tool mutations must use the approval-gated executor');
  assert.match(tools,/instance\.approveProposal\(\)/,'legacy proposal actions must retain the canonical approval executor');
  assert.match(tools,/Nothing will run automatically/,'approval UI must state the no-auto-execution contract');
  assert.match(closeout,/status:'dismissed'/,'dismissing a plan must clear its remaining approval state');
  assert.doesNotMatch(stage4,/mutateVaultSafely|executeDocumentProposal|executeItemProposal/,'executive presentation must not own data mutation');
});

test('desktop, mobile, RTL and touch contracts remain explicit',async()=>{
  const [stage4,accessibility]=await Promise.all([
    read('scripts/ai-conversation-owner-stage4.mjs'),
    read('scripts/ai-conversation-owner-stage4-accessibility.mjs')
  ]);
  assert.match(stage4,/width:min\(500px,calc\(100vw - 28px\)\)/,'desktop assistant should remain compact rather than expand into another page');
  assert.match(stage4,/max-width:502px/);
  assert.match(stage4,/width:100vw/);
  assert.match(stage4,/height:100dvh/);
  assert.match(stage4,/\[dir='rtl'\]/);
  assert.match(stage4,/min-height:44px/);
  assert.match(accessibility,/safe-area-inset-bottom/,'mobile Tools menu must respect the bottom safe area');
  assert.match(accessibility,/ArrowDown/,'Tools menu must retain deterministic keyboard navigation');
});

test('Tools first-focus survives the canonical trigger stopPropagation boundary',async()=>{
  const [placement,accessibility]=await Promise.all([
    read('scripts/ai-batch7-placement-repair.mjs'),
    read('scripts/ai-conversation-owner-stage4-accessibility.mjs')
  ]);
  assert.match(placement,/trigger\.addEventListener\('click',event=>\{event\.stopPropagation\(\);openHub\(trigger,shell\);\}\)/,'canonical Tools trigger intentionally stops click bubbling');
  assert.match(accessibility,/document\.addEventListener\('click',event=>\{[\s\S]*?\},true\);/,'accessibility focus handoff must listen in capture phase so the trigger cannot block it');
  assert.match(accessibility,/getAttribute\('aria-expanded'\)===['"]true['"]\)first\.focus\(\)/,'focus handoff must re-check that the menu actually opened before moving focus');
});

test('workflow hub prioritizes primary tools and isolates history',async()=>{
  const stage4=await read('scripts/ai-conversation-owner-stage4.mjs');
  const start=stage4.indexOf("t('Start here'");
  const finance=stage4.indexOf("t('Finance & execution'");
  const business=stage4.indexOf("t('Business intelligence'");
  const history=stage4.indexOf("t('History'");
  assert.ok(start>=0&&finance>start&&business>finance&&history>business,'workflow sections must stay in the executive priority order');
  assert.match(stage4,/resetInbox\(null\)/,'AI Inbox must remain a primary entry point');
  assert.match(stage4,/lourex-ai-open-business-search/,'Ask Anything must remain a primary entry point');
  assert.match(stage4,/lourex-ai-open-daily/,'daily priorities must remain a primary entry point');
  assert.match(stage4,/runMode\('guardian'\)/,'Accounting Guardian must remain a primary entry point');
  assert.match(stage4,/view: 'history'/,'Job History must stay isolated in its own History section');
  assert.match(stage4,/__lourexExecutiveToolsBatch4/,'workflow hierarchy must have one explicit owner marker');
});
