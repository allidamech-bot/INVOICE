import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [{emptyVault},{assistantCapabilitiesForRole,prepareAssistantContext},{normalizeAssistantState,newAssistantThread,summarizeAssistantConversation,assistantProviderMemory,upsertAssistantThread}]=await Promise.all([
  import('../dist/src/lib/defaults.js'),
  import('../dist/src/lib/ai-assistant-foundation.js'),
  import('../dist/src/storage/assistant-store.js')
]);

function customer(id,name,workspaceId='default'){
  const now='2026-10-04T00:00:00.000Z';
  return{id,workspaceId,createdAt:now,updatedAt:now,companyNameEn:name,companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'USD',paymentTermPresetId:'',paymentTerms:'',paymentDueDays:'',creditLimit:'',creditCurrency:'',notes:''};
}

test('AI Batch 1 role capabilities keep read access broad and mutations role-gated',()=>{
  const viewer=assistantCapabilitiesForRole('viewer','business');
  assert.ok(viewer.includes('finance.explain'));
  assert.ok(viewer.includes('workspace.navigate'));
  assert.ok(!viewer.includes('document.createDraft'));
  assert.ok(!viewer.includes('item.archive'));

  const owner=assistantCapabilitiesForRole('owner','business');
  assert.ok(owner.includes('document.createDraft'));
  assert.ok(owner.includes('document.updateDraft'));
  assert.ok(owner.includes('item.archive'));
  assert.ok(owner.includes('item.updateMetadata'));

  assert.deepEqual(assistantCapabilitiesForRole('owner','personal'),['workspace.help']);
});

test('AI Batch 1 business context is isolated to active workspace and carries operator metadata',()=>{
  const vault=emptyVault();
  vault.customers=[customer('c-active','Active Customer','default'),customer('c-hidden','Hidden Customer','workspace-two')];
  vault.workspaces.push({id:'workspace-two',name:'Other Company',company:structuredClone(vault.company),numbering:structuredClone(vault.appSettings.numbering),smartDefaults:structuredClone(vault.appSettings.smartDefaults),createdAt:'2026-10-04T00:00:00.000Z',updatedAt:'2026-10-04T00:00:00.000Z'});
  vault.branches.push({id:'branch-two',workspaceId:'workspace-two',name:'Other Branch',code:'OTHER',city:'',country:'',active:true,createdAt:'2026-10-04T00:00:00.000Z',updatedAt:'2026-10-04T00:00:00.000Z'});
  const prepared=prepareAssistantContext(vault,'customers','review customers',null,'business');
  assert.equal(prepared.runtime.workspaceId,'default');
  assert.equal(prepared.runtime.branchId,'main');
  assert.equal(prepared.runtime.operatorRole,'owner');
  assert.deepEqual(prepared.vault.customers.map(row=>row.id),['c-active']);
  assert.ok(!prepared.vault.customers.some(row=>row.id==='c-hidden'));
  assert.ok(prepared.runtime.allowedCapabilities.includes('document.createDraft'));
});

test('AI Batch 1 personal scope excludes business records and business mutations',()=>{
  const vault=emptyVault();
  vault.customers=[customer('c-1','Private Business Customer')];
  vault.purchases.push({id:'p-1',number:'PO-1',date:'2026-10-01',dueDate:'',supplierSnapshot:null,currency:'USD',items:[],freight:'0',duty:'0',otherCosts:'0',notes:'',status:'draft',postedAt:'',reversedAt:'',reverseReason:'',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',workspaceId:'default',branchId:'main'});
  const prepared=prepareAssistantContext(vault,'home','help me plan my day',null,'personal');
  assert.equal(prepared.runtime.scope,'personal');
  assert.equal(prepared.vault.customers.length,0);
  assert.equal(prepared.vault.purchases.length,0);
  assert.equal(prepared.vault.documents.length,0);
  assert.deepEqual(prepared.runtime.allowedCapabilities,['workspace.help']);
  assert.equal(prepared.runtime.entity,null);
});

test('AI Batch 1 conversation store scopes threads, preserves explicit new-thread ids and bounds provider memory',()=>{
  const first=newAssistantThread('business','default','main');
  assert.equal(first.scope,'business');
  assert.equal(first.workspaceId,'default');
  const initial=normalizeAssistantState({version:1,threads:[first],currentBusinessThreadId:first.id,currentPersonalThreadId:'',updatedAt:first.updatedAt});
  const messages=Array.from({length:10},(_,index)=>({id:`m${index}`,role:index%2?'assistant':'user',text:`message ${index} ${'x'.repeat(100)}`}));
  const forced='ai-thread-explicit-new';
  const result=upsertAssistantThread(initial,{threadId:forced,scope:'business',workspaceId:'default',branchId:'main',messages});
  assert.equal(result.thread.id,forced);
  assert.equal(result.state.currentBusinessThreadId,forced);
  assert.equal(result.state.threads.length,2);
  assert.ok(result.state.threads.some(row=>row.id===first.id));
  const summary=summarizeAssistantConversation(messages);
  assert.ok(summary.length>0&&summary.length<=1200);
  const provider=assistantProviderMemory(messages,summary);
  assert.ok(provider.length<=520);
  assert.match(provider,/Earlier conversation summary/);
  assert.match(provider,/message 9/);
});

test('AI Batch 1 build contract installs canonical advisor, resumable chats and structured entity hooks',async()=>{
  const [pkg,script,foundation,store,contextual]=await Promise.all([
    readFile(new URL('../package.json',import.meta.url),'utf8'),
    readFile(new URL('../scripts/ai-batch1-unified-assistant.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/lib/ai-assistant-foundation.ts',import.meta.url),'utf8'),
    readFile(new URL('../src/storage/assistant-store.ts',import.meta.url),'utf8'),
    readFile(new URL('../src/components/ContextualAdvisorAction.tsx',import.meta.url),'utf8')
  ]);
  assert.match(pkg,/v485-bundle-visible-ui\.mjs && node scripts\/ai-batch1-unified-assistant\.mjs/);
  assert.match(script,/prepareAssistantContext\(vault, screen, message/);
  assert.match(script,/context\.allowedCapabilities\.includes/);
  assert.match(script,/assistantProviderMemory\(this\.state\.messages/);
  assert.match(script,/lourex-unified-assistant-submit/);
  assert.match(script,/__lourexUnifiedAssistantBatch1/);
  assert.match(script,/__lourexUnifiedHomeAdvisorBatch1/);
  assert.match(script,/Recent conversations/);
  assert.match(script,/__lourexOpenThread/);
  assert.match(script,/__lourexDeleteAssistantThread/);
  assert.match(script,/saveAssistantState/);
  assert.match(foundation,/scopeVault\(vault\)/);
  assert.match(foundation,/scope==='personal'\?personalSafeVault/);
  assert.match(foundation,/registerAssistantEntity/);
  assert.match(contextual,/entity\?:ContextualAdvisorEntity/);
  assert.match(contextual,/entity:props\.entity\?\?null/);
  assert.match(store,/AES-GCM/);
  assert.match(store,/RECORD_ID='assistant-state'/);
});
