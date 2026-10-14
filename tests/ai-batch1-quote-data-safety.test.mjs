import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const {emptyVault}=await import('../dist/src/lib/defaults.js');
const {resolveAiInboxQuoteCustomer,assertAiInboxQuoteProductScope,aiInboxUnlinkedCustomerNote}=
  await import('../dist/src/lib/ai-workflow-quote-guard.js');

function fixture(){
  const vault=emptyVault();
  vault.appSettings.activeWorkspaceId='company-A';
  vault.appSettings.activeBranchId='main';
  vault.customers=[
    {id:'match',workspaceId:'company-A',companyNameEn:'Verified Buyer'},
    {id:'outside',workspaceId:'company-B',companyNameEn:'Another Company Buyer'}
  ];
  vault.savedItems=[
    {id:'sku-1',workspaceId:'company-A',archived:false},
    {id:'foreign-sku',workspaceId:'company-B',archived:false},
    {id:'archived-sku',workspaceId:'company-A',archived:true}
  ];
  return vault;
}

test('AI Inbox quotation accepts only an exact customer match in the active company',()=>{
  const vault=fixture();
  assert.equal(resolveAiInboxQuoteCustomer(vault,'match')?.companyNameEn,'Verified Buyer');
  assert.equal(resolveAiInboxQuoteCustomer(vault,''),null,'unknown customer remains unlinked');
  assert.throws(()=>resolveAiInboxQuoteCustomer(vault,'outside'),/outside the active company/);
  assert.throws(()=>resolveAiInboxQuoteCustomer(vault,'missing'),/match changed/);
  vault.customers.push({id:'match',workspaceId:'company-A',companyNameEn:'Ambiguous Duplicate'});
  assert.throws(()=>resolveAiInboxQuoteCustomer(vault,'match'),/match changed/);
});

test('AI Inbox never uses cross-workspace, stale, duplicate or archived product IDs',()=>{
  const vault=fixture();
  assert.doesNotThrow(()=>assertAiInboxQuoteProductScope(vault,''));
  assert.doesNotThrow(()=>assertAiInboxQuoteProductScope(vault,'sku-1'));
  for(const id of ['foreign-sku','archived-sku','missing'])
    assert.throws(()=>assertAiInboxQuoteProductScope(vault,id),/outside the active company/);
  vault.savedItems.push({id:'sku-1',workspaceId:'company-A'});
  assert.throws(()=>assertAiInboxQuoteProductScope(vault,'sku-1'),/outside the active company/);
});

test('unlinked source customer is clearly marked review-only, with bounded and cleaned text',()=>{
  const note=aiInboxUnlinkedCustomerNote('   RFQ Buyer\\nNewline  ');
  assert.match(note,/NOT linked/);
  assert.match(note,/RFQ Buyer/);
  assert.ok(note.length<300);
  assert.equal(aiInboxUnlinkedCustomerNote('   '),'');
  assert.ok(aiInboxUnlinkedCustomerNote('x'.repeat(500)).length<300);
});

test('AI Inbox saving explicitly does not create a hidden customer record',()=>{
  const source=readFileSync(new URL('../src/components/AiWorkflowTools.tsx',import.meta.url),'utf8');
  const save=source.slice(source.indexOf('private saveQuote=async()=>'),source.indexOf('private supplierProposalSaved='));
  assert.ok(save.length>200);
  assert.match(save,/resolveAiInboxQuoteCustomer\(numbered\.vault,review\.customer\.customerId\)/);
  assert.match(save,/aiInboxUnlinkedCustomerNote\(draft\.customerName\)/);
  assert.doesNotMatch(save,/makeId\('customer'\)|customers:\s*\[|let customers=|created:Customer/);
  assert.match(save,/documents:\[\.\.\.numbered\.vault\.documents,doc\]/);
});

test('missing/malformed selected mode cannot be promoted into executable Controller in live orchestration',async()=>{
  const {orchestrateAiToolRequest}=await import('../dist/src/lib/ai-tool-client.js');
  const vault=emptyVault();
  const base={assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'},screen:'reports'};
  for(const mode of [undefined,null,'invalid','advisor']){
    const context={...base,conversationMode:mode};
    const result=await orchestrateAiToolRequest({message:'افتح التقارير',vault,context,language:'ar'});
    assert.equal(result,null,'a non-Controller mode must never create a navigation proposal');
  }
  const source=readFileSync(new URL('../src/lib/ai-tool-client.ts',import.meta.url),'utf8');
  assert.match(source,/safeMode=input\.context\?\.conversationMode==='controller'\?'controller':'advisor'/);
});
