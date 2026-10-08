import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiToolRuntime,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {emptyVault} from '../dist/src/lib/defaults.js';

const vault=emptyVault();
const context={screen:'home',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}};
const runtime=createAiToolRuntime(vault,context);
const plan=(calls)=>({version:1,goal:'Complete all requested steps safely',calls:calls.map(([tool,args],i)=>({
  id:`step-${i+1}`,tool,args,reason:'User explicitly requested this step'
}))});
const task=['task.create',{title:'Follow up supplier invoice'}];
const missingDraft=['document.updateDraft',{documentId:'not-present',notes:'Update terms'}];

test('B04: partial failure blocks every executable approval, including successful earlier steps',()=>{
  for(const calls of [[task,missingDraft],[missingDraft,task]]){
    const outcome=executeAiToolPlan(runtime,plan(calls));
    assert.equal(outcome.proposal,null);
    assert.equal(outcome.results.length,2);
    assert.equal(outcome.results.some(r=>r.ok&&r.class==='execute'),false);
    const blocked=outcome.results.find(r=>r.tool==='task.create');
    assert.equal(blocked.ok,false);
    assert.equal(blocked.source,'plan-preflight-guard');
    assert.equal(blocked.data,null);
    assert.match(blocked.summary,/No actions have been approved or applied/);
    assert.match(blocked.summary,/document\.updateDraft/);
    assert.equal(vault.documents.length,0);
  }
});

test('B04: protected finance steps block all otherwise-approvable actions in one plan',()=>{
  const outcome=executeAiToolPlan(runtime,plan([task,['accounting.post',{description:'Post journal'}]]));
  assert.equal(outcome.proposal,null);
  assert.equal(outcome.blockedHighImpact,true);
  assert.equal(outcome.results.find(r=>r.tool==='accounting.post').source,'high-impact-guard');
  assert.equal(outcome.results.find(r=>r.tool==='task.create').source,'plan-preflight-guard');
});

test('B04: failed read prerequisite suppresses an unrelated executable approval',()=>{
  const outcome=executeAiToolPlan(runtime,plan([['customer.getSummary',{customerId:'missing'}],task]));
  assert.equal(outcome.proposal,null);
  assert.equal(outcome.results.find(r=>r.tool==='customer.getSummary').ok,false);
  assert.equal(outcome.results.find(r=>r.tool==='task.create').ok,false);
});

test('B04: read-only failures cannot create an action proposal',()=>{
  const result=executeAiToolPlan(runtime,plan([
    ['customer.getSummary',{customerId:'missing'}],
    ['finance.getSummary',{}]
  ]));
  assert.equal(result.proposal,null);
  assert.equal(result.results.find(r=>r.tool==='finance.getSummary').ok,true);
  assert.equal(result.results.find(r=>r.tool==='customer.getSummary').ok,false);
});

test('B04: fully valid mixed read plus action still generates a single human approval',()=>{
  const result=executeAiToolPlan(runtime,plan([['finance.getSummary',{}],task]));
  assert.equal(result.results.every(r=>r.ok),true);
  assert.equal(result.proposal.capability,'tool.execute');
  assert.equal(result.proposal.tool,'task.create');
  assert.equal(result.results.find(r=>r.tool==='task.create').source,'approval-gate');
});

test('B04: fully prepared multi-step plan still preserves explicit sequential approval',()=>{
  const result=executeAiToolPlan(runtime,plan([
    task,
    ['task.create',{title:'Call the customer'}]
  ]));
  assert.equal(result.results.every(r=>r.ok),true);
  assert.equal(result.proposal.capability,'tool.plan');
  assert.equal(result.proposal.steps.length,2);
  assert.ok(result.proposal.steps.every(step=>step.capability==='tool.execute'));
});
