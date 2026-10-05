import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

async function businessRuntime(){
  const [{emptyVault},{createAiToolRuntime}]=await Promise.all([
    import('../dist/src/lib/defaults.js'),
    import('../dist/src/lib/ai-tool-orchestrator.js')
  ]);
  const vault=emptyVault();
  const context={screen:'home',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main',entity:null},advisorV2:{version:2,basis:'deterministic-advisor-data-v2',health:{status:'Healthy',score:null,signals:[]},missingData:[]},finance:{},business:{},pricing:{},drafting:{}};
  return{vault,runtime:createAiToolRuntime(vault,context)};
}

test('multi-step execute requests remain proposals and never mutate during planning',async()=>{
  const {executeAiToolPlan}=await import('../dist/src/lib/ai-tool-orchestrator.js');
  const {vault,runtime}=await businessRuntime();
  const before=JSON.stringify(vault);
  const execution=executeAiToolPlan(runtime,{version:1,goal:'Create two follow-up tasks',calls:[
    {id:'step-1',tool:'task.create',args:{scope:'business',title:'Call customer'},reason:'User requested the first follow-up.'},
    {id:'step-2',tool:'task.create',args:{scope:'business',title:'Check payment'},reason:'User requested the second follow-up.'}
  ]});
  assert.equal(JSON.stringify(vault),before,'planning must not mutate the Vault');
  assert.equal(execution.blockedHighImpact,false);
  assert.equal(execution.proposal?.capability,'tool.plan');
  assert.equal(execution.proposal?.steps?.length,2);
  assert.ok(execution.proposal.steps.every(step=>step.capability==='tool.execute'));
  assert.ok(execution.results.every(row=>row.class==='execute'&&row.ok&&row.source==='approval-gate'));
});

test('high-impact financial calls never enter an approval plan',async()=>{
  const {executeAiToolPlan}=await import('../dist/src/lib/ai-tool-orchestrator.js');
  const {runtime}=await businessRuntime();
  const execution=executeAiToolPlan(runtime,{version:1,goal:'Record payment and create a follow-up',calls:[
    {id:'protected',tool:'payment.record',args:{amount:'100'},reason:'Financial mutation.'},
    {id:'safe-proposal',tool:'task.create',args:{scope:'business',title:'Review payment'},reason:'Review task.'}
  ]});
  assert.equal(execution.blockedHighImpact,true);
  assert.equal(execution.results[0]?.ok,false);
  assert.equal(execution.results[0]?.class,'high-impact');
  assert.match(execution.results[0]?.summary||'',/never executed by LOUREX AI/i);
  assert.equal(execution.proposal?.capability,'tool.execute');
  assert.equal(execution.proposal?.tool,'task.create');
});

test('Batch 4 final owner preserves tool.plan and enforces one explicit approval per step',async()=>{
  const [script,closeoutScript,pkg]=await Promise.all([read('scripts/ai-conversation-owner-stage4.mjs'),read('scripts/ai-conversation-owner-stage4-closeout.mjs'),read('package.json')]);
  assert.match(script,/__lourexNaturalLanguageOsBatch4/);
  assert.match(script,/__lourexProposalCapability === 'tool\.plan'/);
  assert.match(script,/__lourexApprovePlanStep/);
  assert.match(script,/__lourexApplyGenericToolStep/);
  assert.match(script,/applyApprovedToolExecution\(step\)/);
  assert.match(script,/instance\.approveProposal\(\)/,'legacy LOUREX actions must keep using their canonical approval path');
  assert.match(script,/Nothing will run automatically/);
  assert.match(script,/every change needs approval/);
  assert.match(script,/step\.capability!=='workspace\.navigate'/,'navigation must be ordered after in-panel actions so a plan cannot silently lose later approvals');
  assert.doesNotMatch(script,/for\s*\([^)]*steps[^)]*\)\s*\{[^}]*applyApprovedToolExecution/s,'the plan must not bulk-execute all steps');
  assert.match(closeoutScript,/step\.status==='approval'\?\{\.\.\.step,status:'dismissed'/,'dismissing a plan must clear every pending approval state');
  assert.match(closeoutScript,/instance\.state\?\.messages\|\|\[\]\)\.length/,'blank conversations must not render stale tool activity');
  const batch3Closeout=pkg.indexOf('node scripts/ai-conversation-owner-stage3-closeout.mjs');
  const stage4=pkg.indexOf('node scripts/ai-conversation-owner-stage4.mjs');
  const stage4Closeout=pkg.indexOf('node scripts/ai-conversation-owner-stage4-closeout.mjs');
  assert.ok(batch3Closeout>=0&&stage4>batch3Closeout,'Batch 4 final owner must run after the Batch 3 closeout');
  assert.ok(stage4Closeout>stage4,'Batch 4 lifecycle closeout must run after the Stage 4 owner');
});

test('Batch 4 tool UI remains compact, touch-safe and uses existing LOUREX design tokens',async()=>{
  const script=await read('scripts/ai-conversation-owner-stage4.mjs');
  assert.match(script,/lourex-ai-tool-activity/);
  assert.match(script,/lourex-ai-tool-approval/);
  assert.match(script,/min-height:44px/);
  assert.match(script,/safe-area-inset-bottom/);
  assert.match(script,/html\[dir='rtl'\]/);
  assert.match(script,/var\(--lx485-blue,var\(--ft-accent\)\)/);
  assert.doesNotMatch(script,/#619dff|#3975e8|new Chat|second chatbot/i);
});

test('Batch 4 replaces raw tool JSON with structured natural-language sections',async()=>{
  const script=await read('scripts/ai-conversation-owner-stage4.mjs');
  assert.match(script,/__lourexNaturalizeToolAnswer/);
  assert.match(script,/ar\?'Summary':'Summary'/);
  assert.match(script,/ar\?'Known':'Known'/);
  assert.match(script,/ar\?'Actions':'Actions'/);
  assert.match(script,/ar\?'Risk':'Risk'/);
  assert.match(script,/__lourexCompactObject/);
  assert.match(script,/No change was applied without your approval/);
});
