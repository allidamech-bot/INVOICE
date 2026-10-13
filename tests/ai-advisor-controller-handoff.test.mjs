import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareAdvisorControllerHandoff} from '../dist/src/lib/ai-advisor-controller-handoff.js';

const advisor={scope:'business',accountId:'qa-firebase',workspaceId:'default',branchId:'main',threadId:'advisor-thread'};
const controller={...advisor,threadId:'controller-thread'};

test('Advisor suggestion becomes user-reviewable draft input, never an approval or mutation',()=>{
  const suggestion='خفض سعر 3 أصناف بنسبة 5%. راجع تأثير ذلك على هامش الربح.';
  const ar=prepareAdvisorControllerHandoff(suggestion,advisor,controller,'ar');
  assert.match(ar,/المستشار/);
  assert.match(ar,/المتحكم/);
  assert.match(ar,/لا تنفذ أو تحفظ أو تصدر/);
  assert.match(ar,/خفض سعر 3 أصناف/);
  const en=prepareAdvisorControllerHandoff('Evaluate USD receivables',advisor,controller,'en');
  assert.match(en,/NOT an execution command/);
  assert.match(en,/do not execute|Do not execute/);
  assert.match(en,/Evaluate USD receivables/);
});

test('source and destination must be distinct threads within one identical account, company and branch',()=>{
  for(const changed of [
    {...controller,scope:'personal'},
    {...controller,accountId:'other'},
    {...controller,workspaceId:'foreign'},
    {...controller,branchId:'secondary'},
    {...controller,threadId:advisor.threadId},
  ])assert.throws(()=>prepareAdvisorControllerHandoff('analyze',advisor,changed,'en'),/cannot cross/);
  assert.throws(()=>prepareAdvisorControllerHandoff('analyze',{...advisor,accountId:''},controller,'en'),/cannot cross/);
});

test('reject empty and oversized Advisor content instead of silently omitting lines',()=>{
 assert.throws(()=>prepareAdvisorControllerHandoff('   ',advisor,controller,'en'),/empty or too long/);
 assert.throws(()=>prepareAdvisorControllerHandoff('A'.repeat(4001),advisor,controller,'en'),/empty or too long/);
 const all='A'.repeat(4000);
 assert.ok(prepareAdvisorControllerHandoff(all,advisor,controller,'en').endsWith(all));
});

test('Advisor handoff UI only prefills Controller composer after an explicit click and mode switch',async()=>{
 const ui=await readFile(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8');
 assert.match(ui,/lxw-advisor-controller-handoff/);
 assert.match(ui,/mode==='advisor'\?<button/);
 assert.match(ui,/await host\.__workspaceSwitchMode\('controller'\)/);
 assert.match(ui,/prepareAdvisorControllerHandoff\(text,scopedFrom,destination\.scope/);
 assert.match(ui,/host\.setState\(\{input:prepared,error:''/);
 const snippet=ui.slice(ui.indexOf('host.__workspaceSendAdvisorProposal=async'),ui.indexOf('host.__workspaceRefresh=refresh;'));
 assert.ok(!/host\.ask\(|approveProposal\(|stageKernelArtifact\(/.test(snippet),'handoff callback must not send or execute');
});
