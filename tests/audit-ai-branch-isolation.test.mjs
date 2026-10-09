import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('assistant financial and business context cannot read another branch or company',async()=>{
  const [{emptyVault},{scopeVault},copilot]=await Promise.all([
    import('../dist/src/lib/defaults.js'),
    import('../dist/src/lib/workspaces.js'),
    read('src/components/AiCopilot.tsx')
  ]);
  const start=copilot.indexOf('export function buildAiContext(');
  const end=copilot.indexOf('export function capabilityRequiresApproval(',start);
  assert.ok(start>=0&&end>start,'exercise the production context constructor');
  const source=copilot.slice(start,end);
  const compiled=ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
  }}).outputText;
  const context={exports:{},scopeVault,AI_CAPABILITIES:[],
    buildAiFinanceContext:input=>({
      documentIds:input.documents.map(doc=>doc.id),
      paymentIds:input.payments.map(payment=>payment.id),
      activeDocumentId:input.activeDocument?.id??null
    }),
    buildAiBusinessContext:input=>({
      asOf:'2026-10-09',
      documentIds:input.documents.map(doc=>doc.id),
      purchaseIds:input.purchases.map(row=>row.id),
      customerIds:input.customers.map(row=>row.id)
    }),
    buildProductPricingContext:input=>({
      itemIds:input.savedItems.map(item=>item.id),
      purchaseIds:input.purchases.map(row=>row.id)
    }),
    draftReference:(input,message,activeDocument)=>({
      visibleDocumentIds:input.documents.map(doc=>doc.id),
      activeDocumentId:activeDocument?.id??null
    })
  };
  vm.runInNewContext(compiled,context);
  const vault=emptyVault();
  vault.appSettings.activeWorkspaceId='default';
  vault.appSettings.activeBranchId='main';
  const doc=(id,workspaceId,branchId)=>({id,workspaceId,branchId,kind:'proforma',role:'standard',status:'draft',lifecycleStatus:'active',currency:'USD',items:[]});
  const main=doc('main-doc','default','main');
  const foreignBranch=doc('branch-B-doc','default','branch-B');
  const foreignCompany=doc('other-company-doc','other-company','main');
  vault.documents=[main,foreignBranch,foreignCompany];
  vault.payments=[{id:'main-payment',workspaceId:'default',branchId:'main'},
    {id:'other-payment',workspaceId:'default',branchId:'branch-B'}];
  vault.purchases=[{id:'main-purchase',workspaceId:'default',branchId:'main'},
    {id:'other-purchase',workspaceId:'default',branchId:'branch-B'}];
  vault.customers=[{id:'company-customer',workspaceId:'default'},
    {id:'other-company-customer',workspaceId:'other-company'}];
  vault.savedItems=[{id:'company-product',workspaceId:'default'},
    {id:'other-company-product',workspaceId:'other-company'}];

  const build=context.exports.buildAiContext;
  const financeSource={documents:vault.documents,payments:vault.payments,customers:vault.customers,activeDocument:foreignBranch};
  const result=build('documents','en',financeSource,vault,'Show my branch balances',foreignBranch);
  assert.deepEqual(Array.from(result.finance.documentIds),['main-doc']);
  assert.deepEqual(Array.from(result.finance.paymentIds),['main-payment']);
  assert.equal(result.finance.activeDocumentId,null,'foreign active invoice must never enter finance context');
  assert.deepEqual(Array.from(result.business.documentIds),['main-doc']);
  assert.deepEqual(Array.from(result.business.purchaseIds),['main-purchase']);
  assert.deepEqual(Array.from(result.business.customerIds),['company-customer']);
  assert.deepEqual(Array.from(result.pricing.itemIds),['company-product']);
  assert.deepEqual(Array.from(result.pricing.purchaseIds),['main-purchase']);
  assert.deepEqual(Array.from(result.drafting.visibleDocumentIds),['main-doc']);
  assert.equal(result.drafting.activeDocumentId,null);
  const same=build('editor','en',financeSource,vault,'Review main',main);
  assert.equal(same.finance.activeDocumentId,'main-doc');
  assert.equal(same.drafting.activeDocumentId,'main-doc');
});

test('AI approval cannot modify another branch, another company, a final document or a voided document',async()=>{
  const [{emptyVault},{assertAiDocumentUpdateApproval}]=await Promise.all([
    import('../dist/src/lib/defaults.js'),
    import('../dist/src/lib/ai-document-approval-guard.js')
  ]);
  const vault=emptyVault();
  vault.appSettings.activeWorkspaceId='default';
  vault.appSettings.activeBranchId='main';
  const make=(id,workspaceId,branchId,status='draft',lifecycleStatus='active')=>({
    id,workspaceId,branchId,status,lifecycleStatus,items:[],currency:'USD'
  });
  const own=make('main-doc','default','main');
  const crossBranch=make('branch-B-doc','default','branch-B');
  const crossCompany=make('foreign-company-doc','company-B','main');
  const final=make('issued','default','main','final');
  const voided=make('voided','default','main','draft','voided');
  vault.documents=[own,crossBranch,crossCompany,final,voided];
  const approve=documentId=>assertAiDocumentUpdateApproval(vault,{
    documentId,addItems:[],itemEdits:[],termsPatch:{}
  });
  assert.doesNotThrow(()=>approve('main-doc'));
  assert.throws(()=>approve('branch-B-doc'),/company or branch/);
  assert.throws(()=>approve('foreign-company-doc'),/company or branch/);
  assert.throws(()=>approve('issued'),/Only active drafts/);
  assert.throws(()=>approve('voided'),/Only active drafts/);
});


test('pending AI document follow-ups cannot resurrect drafts from a previously selected branch',async()=>{
  const [{emptyVault},{scopeVault},copilot]=await Promise.all([
    import('../dist/src/lib/defaults.js'),
    import('../dist/src/lib/workspaces.js'),
    read('src/components/AiCopilot.tsx')
  ]);
  const vault=emptyVault();
  vault.appSettings.activeWorkspaceId='default';
  vault.appSettings.activeBranchId='main';
  vault.documents=[
    {id:'old-branch-draft',workspaceId:'default',branchId:'branch-B',status:'draft',kind:'proforma'},
    {id:'current-draft',workspaceId:'default',branchId:'main',status:'draft',kind:'proforma'}
  ];
  const scoped=scopeVault(vault);
  assert.deepEqual(scoped.documents.map(row=>row.id),['current-draft']);
  assert.equal(scoped.documents.find(row=>row.id==='old-branch-draft'),undefined);
  const start=copilot.indexOf("if(pendingDocumentProposal?.capability==='document.updateDraft'&&!context.drafting.activeDocument)");
  const end=copilot.indexOf('    if(pendingDocumentProposal){',start);
  assert.ok(start>0&&end>start);
  const fallback=copilot.slice(start,end);
  assert.match(fallback,/const scoped=scopeVault\(resumed\.vault\)/);
  assert.match(fallback,/const target=scoped\.documents\.find\(doc=>doc\.id===pendingDocumentProposal\.documentId\)/);
  assert.match(fallback,/if\(!target\)\{[\s\S]*proposal:null,review:null[\s\S]*return;/);
  assert.match(fallback,/draftReference\(scoped,message,target\)/);
  assert.doesNotMatch(fallback,/resumed\.vault\.documents\.find\(/);
});
