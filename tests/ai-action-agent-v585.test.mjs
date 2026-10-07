import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('v585 quote creation intent is promoted from preview-only planning to a real approval-gated draft',async()=>{
  const client=await read('src/lib/ai-tool-client.ts');
  const api=await read('api/ai-inbox.js');
  assert.match(client,/function requestedDocumentKind/);
  assert.match(client,/promoteDocumentCreationPlan/);
  assert.match(client,/quotation\.prepare/);
  assert.match(client,/tool:'document\.createDraft'/);
  assert.match(client,/preview\\s\*only|معاينة/);
  assert.match(api,/use document\.createDraft\. Do NOT stop at quotation\.prepare\/invoice\.prepare/);
  assert.match(api,/Use quotation\.prepare or invoice\.prepare ONLY/);
  assert.match(api,/if\(depth>4\)return null/,'nested item/customer planner args must survive bounded sanitization');
});

test('v585 executable document tool preserves inline customer and item facts for the approval proposal',async()=>{
  const [{emptyVault},{createAiToolRuntime,executeAiToolPlan}]=await Promise.all([
    import('../dist/src/lib/defaults.js'),
    import('../dist/src/lib/ai-tool-orchestrator.js')
  ]);
  const vault=emptyVault();
  vault.company.defaultCurrency='USD';
  const runtime=createAiToolRuntime(vault,{assistantRuntime:{scope:'business',workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId}});
  const plan={version:1,goal:'Create quotation',calls:[{id:'q1',tool:'document.createDraft',reason:'requested',args:{
    kind:'proforma',
    currency:'USD',
    customer:{companyNameEn:'Safa Food Distribution Co.',contactPerson:'Omar Al-Harbi',city:'Jeddah',country:'Saudi Arabia',email:'buyer@example.test'},
    items:[
      {descriptionEn:'Rice 5 kg',quantity:'100',unit:'CTN',unitPrice:'18.50'},
      {descriptionEn:'Sunflower Oil 1 L',quantity:'80',unit:'CTN',unitPrice:'22.00'}
    ]
  }}]};
  const result=executeAiToolPlan(runtime,plan);
  assert.equal(result.results[0].ok,true);
  assert.equal(result.proposal.capability,'document.createDraft');
  assert.equal(result.proposal.customerId,'');
  assert.equal(result.proposal.customerDraft.companyNameEn,'Safa Food Distribution Co.');
  assert.equal(result.proposal.customerDraft.city,'Jeddah');
  assert.equal(result.proposal.items.length,2);
  assert.equal(result.proposal.items[0].quantity,'100');
  assert.equal(result.proposal.items[1].unitPrice,'22.00');
});

test('v585 chat action produces a tangible saved artifact with open-document affordance and grounded customer creation',async()=>{
  const copilot=await read('src/components/AiCopilot.tsx');
  assert.match(copilot,/AiCustomerDraftInput/);
  assert.match(copilot,/safeCustomerDraft/);
  assert.match(copilot,/customerDraft:AiCustomerDraftInput\|null/);
  assert.match(copilot,/customers=\[\.\.\.customers,customer\]/);
  assert.match(copilot,/lourex-ai-document-created/);
  assert.match(copilot,/lourex-ai-created-artifact/);
  assert.match(copilot,/Open quotation/);
  assert.match(copilot,/lourex-global-search-open/);
  assert.match(copilot,/MAX_MESSAGE_CHARS=6000/);
});

test('v585 File to Quote no longer drops a new customer and exposes the saved record',async()=>{
  const tools=await read('src/components/AiWorkflowTools.tsx');
  assert.match(tools,/Created from an approved LOUREX AI quotation source/);
  assert.match(tools,/customerSnapshot:customerSnapshotFrom\(customer\)/);
  assert.match(tools,/savedReference:saved\?\.number\|\|''/);
  assert.match(tools,/Open saved record/);
  assert.match(tools,/autoOpenUnique:true/);
});

test('v585 empty queries never bind unrelated first customer, supplier or product',async()=>{
  const source=await read('src/lib/ai-tool-orchestrator.ts');
  const guards=source.match(/if\(!q\)return null;/g)||[];
  assert.ok(guards.length>=3,'customer/supplier/product lookup must require a real query when no id exists');
});

test('v585 conversation history refresh is awaited before reopening a saved chat',async()=>{
  const owner=await read('scripts/ai-batch1-unified-assistant.mjs');
  assert.match(owner,/await new Promise\(resolve=>instance\.setState\(\{assistantThreads:/);
});
