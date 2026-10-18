import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {scopeVault} from '../dist/src/lib/workspaces.js';
import {createAiToolRuntime,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';
import {deterministicNamedAdvisorReads,orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';

const stamp='2026-10-18T00:00:00.000Z';
function fixture(){
  const vault=emptyVault();
  vault.appSettings.activeWorkspaceId='default';
  vault.appSettings.activeBranchId='main';
  vault.teamMembers=[{id:'qa-owner',role:'owner',status:'active',name:'QA Operator'}];
  vault.appSettings.activeTeamMemberId='qa-owner';
  vault.customers=[
    {id:'qa-customer',workspaceId:'default',companyNameEn:'LOUREX QA TEST',companyNameAr:'',
      contactPerson:'',phone:'',email:'',city:'',country:'',updatedAt:stamp},
    {id:'outside-customer',workspaceId:'another-company',companyNameEn:'OTHER COMPANY ONLY',
      companyNameAr:'',contactPerson:'',phone:'',email:'',updatedAt:stamp}
  ];
  vault.savedItems=[
    {id:'qa-product',workspaceId:'default',sku:'QA-ACCEPT-001',descriptionEn:'Production Acceptance Test Product',
      descriptionAr:'',unit:'PCS',lastUnitCost:'40',lastCostCurrency:'USD',lastUnitPrice:'100',lastCurrency:'USD',
      archived:false,createdAt:stamp,updatedAt:stamp},
    {id:'outside-product',workspaceId:'another-company',sku:'PRIVATE-ONLY-002',descriptionEn:'Other Company Product',
      descriptionAr:'',unit:'PCS',lastUnitCost:'40',lastCostCurrency:'USD',lastUnitPrice:'100',lastCurrency:'USD',
      archived:false,createdAt:stamp,updatedAt:stamp}
  ];
  const context={conversationMode:'advisor',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'},
    screen:'home',finance:{},business:{}};
  return {vault,context,runtime:createAiToolRuntime(scopeVault(vault),context)};
}

test('Advisor resolves the exact live acceptance customer and SKU in English, without model planning or writes',async()=>{
  const {vault,context,runtime}=fixture(),before=JSON.stringify(vault);
  const message='Explain the balance and invoice history of customer LOUREX QA TEST and review product QA-ACCEPT-001 stock.';
  const plan=deterministicNamedAdvisorReads(message,runtime);
  assert.deepEqual(plan?.calls.map(row=>row.tool),['customer.getSummary','product.getSummary']);
  assert.equal(plan.calls[0].args.customerId,'qa-customer');
  assert.equal(plan.calls[1].args.itemId,'qa-product');
  const out=executeAiToolPlan(runtime,plan);
  assert.equal(out.proposal,null);
  assert.ok(out.results.every(row=>row.ok&&row.class==='read'&&row.source==='lourex-local-engine'));
  assert.equal(out.results[0].data.name,'LOUREX QA TEST');
  assert.equal(out.results[1].data.sku,'QA-ACCEPT-001');
  const result=await orchestrateAiToolRequest({message,vault,context,language:'en'});
  assert.equal(result?.plannedBy,'local');
  assert.deepEqual(result?.results.map(row=>row.tool),['customer.getSummary','product.getSummary']);
  assert.match(result?.answer||'',/LOUREX QA TEST/);
  assert.match(result?.answer||'',/QA-ACCEPT-001/);
  assert.equal(result?.proposal,null);
  assert.equal(JSON.stringify(vault),before);
});

test('Advisor resolves separate Arabic customer and product questions as read-only scoped tools',()=>{
  const {runtime}=fixture();
  const queries=[
    ['اشرح رصيد العميل LOUREX QA TEST وتاريخ فواتيره','customer.getSummary','qa-customer'],
    ['راجع الصنف QA-ACCEPT-001 واعرض مخزونه وسعره','product.getSummary','qa-product']
  ];
  for(const [message,expected,id] of queries){
    const plan=deterministicNamedAdvisorReads(message,runtime);
    assert.equal(plan?.calls.length,1,message);
    assert.equal(plan.calls[0].tool,expected);
    const out=executeAiToolPlan(runtime,plan);
    assert.equal(out.proposal,null);
    assert.equal(out.results[0].ok,true);
    assert.equal(out.results[0].data.id,id);
  }
});

test('Advisor does not leak records outside workspace, read unrelated names, or use stale branch',()=>{
  const {runtime,vault,context}=fixture();
  assert.equal(deterministicNamedAdvisorReads('Find customer OTHER COMPANY ONLY',runtime),null);
  assert.equal(deterministicNamedAdvisorReads('Review product PRIVATE-ONLY-002',runtime),null);
  assert.equal(deterministicNamedAdvisorReads('What is the weather today?',runtime),null);
  const wrong=createAiToolRuntime(scopeVault(vault),{
    ...context,assistantRuntime:{...context.assistantRuntime,workspaceId:'wrong-workspace'}
  });
  assert.equal(deterministicNamedAdvisorReads('Review product QA-ACCEPT-001',wrong),null);
  const branch=createAiToolRuntime(scopeVault(vault),{
    ...context,assistantRuntime:{...context.assistantRuntime,branchId:'wrong-branch'}
  });
  assert.equal(deterministicNamedAdvisorReads('Review product QA-ACCEPT-001',branch),null);
});

test('Advisor refuses ambiguous identities, writes, and personal-scope reads',()=>{
  const {runtime,vault,context}=fixture();
  vault.customers.push({...vault.customers[0],id:'duplicate-qa'});
  const scoped=createAiToolRuntime(scopeVault(vault),context);
  assert.equal(deterministicNamedAdvisorReads('Review customer LOUREX QA TEST',scoped),null);
  assert.equal(deterministicNamedAdvisorReads('Update product QA-ACCEPT-001 price to 500',runtime),null);
  const personal=createAiToolRuntime(scopeVault(vault),{
    ...context,assistantRuntime:{...context.assistantRuntime,scope:'personal'}
  });
  assert.equal(deterministicNamedAdvisorReads('Review product QA-ACCEPT-001',personal),null);
});
