import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const root=new URL('../',import.meta.url);const read=path=>readFile(new URL(path,root),'utf8');

test('assistant memory is scope-separated, expirable and Personal memory can be disabled',async()=>{
  const {normalizeAssistantMemory,scopedAssistantMemories,relevantAssistantMemories,assistantMemoryProviderText}=await import('../dist/src/storage/assistant-memory-store.js');
  const state=normalizeAssistantMemory({version:1,personalMemoryEnabled:true,updatedAt:'2026-10-04T10:00:00Z',records:[
    {id:'p1',scope:'personal',workspaceId:'leak',branchId:'leak',kind:'preference',content:'Prefer concise study explanations',source:'user-approved',createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-01T10:00:00Z',lastConfirmedAt:'2026-10-01T10:00:00Z',active:true},
    {id:'b1',scope:'business',workspaceId:'w1',branchId:'b1',kind:'fact',content:'Customer quotes should normally be English',source:'user-approved',createdAt:'2026-10-01T11:00:00Z',updatedAt:'2026-10-01T11:00:00Z',lastConfirmedAt:'2026-10-01T11:00:00Z',active:true},
    {id:'b2',scope:'business',workspaceId:'w2',branchId:'b2',kind:'fact',content:'Other workspace secret',source:'user-approved',createdAt:'2026-10-01T12:00:00Z',updatedAt:'2026-10-01T12:00:00Z',lastConfirmedAt:'2026-10-01T12:00:00Z',active:true},
    {id:'expired',scope:'personal',kind:'note',content:'Old mutable fact',source:'user-approved',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',lastConfirmedAt:'2026-01-01T00:00:00Z',expiresAt:'2026-01-02T00:00:00Z',active:true}
  ]});
  assert.equal(state.records.find(row=>row.id==='p1').workspaceId,'');assert.equal(state.records.find(row=>row.id==='p1').branchId,'');
  assert.deepEqual(scopedAssistantMemories(state,'business','w1','b1').map(row=>row.id),['b1']);
  assert.deepEqual(scopedAssistantMemories(state,'personal').map(row=>row.id),['p1']);
  assert.equal(relevantAssistantMemories(state,{scope:'personal',query:'study explanations'})[0].id,'p1');
  assert.match(assistantMemoryProviderText(state,{scope:'business',workspaceId:'w1',branchId:'b1',query:'quotes'}),/Customer quotes/);
  state.personalMemoryEnabled=false;assert.deepEqual(scopedAssistantMemories(state,'personal'),[]);assert.equal(assistantMemoryProviderText(state,{scope:'personal',query:'study'}),'');
});

test('assistant task v2 fields migrate old records and preserve strict Personal isolation',async()=>{
  const {normalizeAssistantTasks,scopedAssistantTasks,assistantTasksProviderText}=await import('../dist/src/storage/assistant-task-store.js');
  const state=normalizeAssistantTasks({version:1,tasks:[
    {id:'legacy',scope:'business',workspaceId:'w1',branchId:'b1',title:'Legacy follow-up',notes:'',dueAt:'2026-10-06T08:00:00Z',relatedEntityType:'customer',relatedEntityId:'c1',status:'open',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'},
    {id:'personal',scope:'personal',workspaceId:'w1',branchId:'b1',title:'Study chapter',notes:'',dueAt:'2026-10-05T08:00:00Z',recurrence:'weekly',conditionType:'customer-unpaid',conditionValue:'should-not-be-business-linked',relatedEntityType:'customer',relatedEntityId:'c1',status:'open',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z'}
  ]});
  const legacy=state.tasks.find(row=>row.id==='legacy');assert.equal(legacy.recurrence,'none');assert.equal(legacy.conditionType,'none');assert.equal(legacy.sourceThreadId,'');
  const personal=state.tasks.find(row=>row.id==='personal');assert.equal(personal.workspaceId,'');assert.equal(personal.branchId,'');assert.equal(personal.relatedEntityType,'');assert.equal(personal.relatedEntityId,'');assert.equal(personal.recurrence,'weekly');
  assert.deepEqual(scopedAssistantTasks(state,{scope:'business',workspaceId:'w1',branchId:'b1'}).map(row=>row.id),['legacy']);
  assert.deepEqual(scopedAssistantTasks(state,{scope:'personal'}).map(row=>row.id),['personal']);
  assert.match(assistantTasksProviderText(state,{scope:'personal'}),/Study chapter/);
});

test('memory and task commands are local-first and all durable mutations remain approval-gated',async()=>{
  const [personal,client,actions]=await Promise.all([read('src/lib/ai-personal-assistant.ts'),read('src/lib/ai-tool-client.ts'),read('src/lib/ai-tool-actions.ts')]);
  assert.doesNotMatch(personal,/requestAiJson|fetch\(/,'explicit memory/task commands must not spend provider credits');
  for(const token of ['rememberContent','forgetQuery','memoryListIntent','taskListIntent','disableMemoryIntent','enableMemoryIntent','task.complete','task.delete','memory.create','memory.delete','memory.setEnabled'])assert.match(personal,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(client,/handleAssistantLocalCommand/);assert.ok(client.indexOf('handleAssistantLocalCommand')<client.indexOf('isCfoIntent(input.message)'),'local memory/task routing must happen before provider/tool planning paths');
  for(const tool of ['memory.create','memory.update','memory.delete','memory.setEnabled','task.update','task.complete','task.delete'])assert.ok(actions.includes(`'${tool}'`),`missing approval-gated action ${tool}`);
  assert.match(actions,/resumeVaultSession/);assert.match(actions,/createAssistantMemory/);assert.match(actions,/completeAssistantTask/);
});

test('Personal runtime is a real productivity assistant while business context stays excluded',async()=>{
  const {assistantRuntimeHint,prepareAssistantContext}=await import('../dist/src/lib/ai-assistant-foundation.js');
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const prepared=prepareAssistantContext(emptyVault(),'home','help me study',null,'personal');
  const hint=assistantRuntimeHint(prepared.runtime);
  assert.match(hint,/general personal productivity assistant/i);
  for(const capability of ['writing','translation','planning','study help','personal budgeting','lists','goals'])assert.match(hint,new RegExp(capability,'i'));
  assert.match(hint,/Business records.*intentionally excluded/i);
  assert.equal(prepared.runtime.workspaceId,'');assert.equal(prepared.runtime.branchId,'');assert.equal(prepared.runtime.entity,null);
  assert.deepEqual(prepared.runtime.allowedCapabilities,['workspace.help']);
});

test('Batch 6 runtime sends only bounded relevant memory/task context and exposes a compact manager',async()=>{
  const [pkg,installer]=await Promise.all([read('package.json'),read('scripts/ai-batch6-personal-memory-tasks.mjs')]);
  assert.match(pkg,/ai-batch4-tool-orchestrator\.mjs && node scripts\/ai-batch6-personal-memory-tasks\.mjs/);
  assert.match(installer,/assistantProviderContext/);assert.match(installer,/durableContext\.slice\(0, 330\)/);assert.match(installer,/scope !== 'temporary'/);
  for(const token of ['Memory & Tasks','Use Personal memory','Durable memory','Tasks & reminders','Confirm delete','assistantManagerSnapshot','safe-area-inset-top','safe-area-inset-bottom'])assert.match(installer,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(installer,/threadId = this\.__lourexAssistantThreadId/);
});

test('Batch 6 adds no Serverless Function and preserves Vercel Hobby budget',async()=>{
  const files=(await readdir(new URL('../api/',import.meta.url))).filter(name=>name.endsWith('.js'));assert.ok(files.length<=12,`Vercel Hobby function budget exceeded: ${files.length}`);
  assert.equal(files.includes('ai-personal-assistant.js'),false);
});
