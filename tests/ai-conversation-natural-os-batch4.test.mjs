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
  assert.equal(JSON.stringify(vault),before);
  assert.equal(execution.proposal?.capability,'tool.plan');
  assert.equal(execution.proposal?.steps?.length,2);
});

test('high-impact financial calls never enter an approval plan',async()=>{
  const {executeAiToolPlan}=await import('../dist/src/lib/ai-tool-orchestrator.js');
  const {runtime}=await businessRuntime();
  const execution=executeAiToolPlan(runtime,{version:1,goal:'Record payment and create a follow-up',calls:[
    {id:'protected',tool:'payment.record',args:{amount:'100'},reason:'Financial mutation.'},
    {id:'safe-proposal',tool:'task.create',args:{scope:'business',title:'Review payment'},reason:'Review task.'}
  ]});
  assert.equal(execution.blockedHighImpact,true);
  assert.equal(execution.results[0]?.class,'high-impact');
  assert.equal(execution.proposal?.capability,'tool.execute');
});

test('Batch 4 tool owner preserves plans and explicit approvals',async()=>{
  const [script,closeout,pkg]=await Promise.all([
    read('scripts/ai-conversation-owner-stage4-tools.mjs'),
    read('scripts/ai-conversation-owner-stage4-tools-closeout.mjs'),
    read('package.json')
  ]);
  assert.match(script,/__lourexNaturalLanguageOsBatch4/);
  assert.match(script,/__lourexProposalCapability === 'tool\.plan'/);
  assert.match(script,/applyApprovedToolExecution\(step\)/);
  assert.match(script,/instance\.approveProposal\(\)/);
  assert.match(script,/Nothing will run automatically/);
  assert.match(closeout,/__lourexNaturalLanguageOsBatch4Closeout/);
  const tools=pkg.indexOf('node scripts/ai-conversation-owner-stage4-tools.mjs');
  const close=pkg.indexOf('node scripts/ai-conversation-owner-stage4-tools-closeout.mjs');
  const executive=pkg.indexOf('node scripts/ai-conversation-owner-stage4.mjs');
  assert.ok(tools>=0&&close>tools&&executive>close);
});

test('Batch 4 Arabic executive response sections are fully localized',async()=>{
  const closeout=await read('scripts/ai-conversation-owner-stage4-tools-closeout.mjs');
  assert.match(closeout,/الملخص/);
  assert.match(closeout,/البيانات المؤكدة/);
  assert.match(closeout,/الإجراءات/);
  assert.match(closeout,/تنبيه/);
  assert.match(closeout,/المخاطر/);
  assert.doesNotMatch(closeout,/\["ar\?'Summary':'Summary'","ar\?'Summary':'Summary'"\]/);
});

test('Batch 4 tool UI remains touch-safe and token-based',async()=>{
  const script=await read('scripts/ai-conversation-owner-stage4-tools.mjs');
  assert.match(script,/lourex-ai-tool-activity/);
  assert.match(script,/lourex-ai-tool-approval/);
  assert.match(script,/min-height:44px/);
  assert.match(script,/safe-area-inset-bottom/);
  assert.match(script,/var\(--lx485-blue,var\(--ft-accent\)\)/);
  assert.doesNotMatch(script,/#619dff|#3975e8|second chatbot/i);
});
