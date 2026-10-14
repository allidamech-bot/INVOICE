import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const {emptyVault}=await import('../dist/src/lib/defaults.js');
const {resolveAiInboxQuoteCustomer,assertAiInboxQuoteProductScope,assertAiInboxQuoteReviewFresh,aiInboxUnlinkedCustomerNote}=
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

test('a changed customer match or product cost blocks stale quote save before numbering',async()=>{
  const {buildQuoteAiReview}=await import('../dist/src/lib/quote-ai-review.js');
  const {scopeVault}=await import('../dist/src/lib/workspaces.js');
  const vault=emptyVault();
  vault.savedItems.push({
    id:'good-sku',workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId,
    archived:false,sku:'CHOC-01',descriptionEn:'Chocolate carton',descriptionAr:'',
    lastUnitCost:'10.00',lastCostCurrency:'USD',lastUnitPrice:'15.00',lastCurrency:'USD'
  });
  const draft={
    customerName:'Unregistered Buyer',customerEmail:'',customerPhone:'',
    customerConfidence:1,customerNote:'',currency:'USD',incoterm:'',paymentTerms:'',
    deliveryTime:'',validity:'',remarks:'',notes:'',
    items:[{sku:'CHOC-01',descriptionEn:'Chocolate carton',descriptionAr:'',quantity:'50',unit:'CTN',
      unitPrice:'20',quantityConfidence:1,quantityAmbiguous:false,quantityNote:'',
      productConfidence:1,productNote:''}]
  };
  const review=buildQuoteAiReview(scopeVault(vault),draft);
  assert.doesNotThrow(()=>assertAiInboxQuoteReviewFresh(vault,draft,review));
  const differentBuyer={...draft,customerName:'Changed Buyer'};
  assert.throws(()=>assertAiInboxQuoteReviewFresh(vault,differentBuyer,review),/Quotation source changed since review/,'buyer identity must be re-reviewed even without a saved customer match');
  for(const [change,details] of [
    [{customerPhone:'+9050012345'},'customer phone'],
    [{incoterm:'FOB Istanbul'},'delivery term'],
    [{paymentTerms:'30% deposit'},'payment term'],
    [{validity:'7 days'},'validity'],
    [{notes:'Unreviewed special instructions'},'notes'],
    [{items:[{...draft.items[0],quantity:'500'}]},'quantity'],
    [{items:[{...draft.items[0],descriptionEn:'Different SKU line'}]},'description'],
    [{items:[{...draft.items[0],unit:'PCS'}]},'unit']
  ]){
    assert.throws(()=>assertAiInboxQuoteReviewFresh(vault,{...draft,...change},review),
      /Quotation source changed since review/,details+' must require a new preview');
  }
  assert.throws(()=>assertAiInboxQuoteReviewFresh(vault,draft,{...review,sourceSnapshot:undefined}),
    /Quotation source changed since review/,'legacy unbound review cannot be saved');
  const saved=vault.savedItems.at(-1);
  saved.lastUnitCost='11.00';
  assert.throws(()=>assertAiInboxQuoteReviewFresh(vault,draft,review),/Refresh and review every line/);
  saved.lastUnitCost='10.00';
  vault.savedItems.push({...saved,id:'duplicate',sku:'CHOC-01'});
  assert.throws(()=>assertAiInboxQuoteReviewFresh(vault,draft,review),/Refresh and review every line/);
});

test('before saving a quote, the fresh pricing review runs inside mutation before number reservation',()=>{
  const source=readFileSync(new URL('../src/components/AiWorkflowTools.tsx',import.meta.url),'utf8');
  const save=source.slice(source.indexOf('private saveQuote=async()=>'),source.indexOf('private supplierProposalSaved='));
  const reviewIndex=save.indexOf('assertAiInboxQuoteReviewFresh(vault,draft,review)');
  const numberIndex=save.indexOf("nextDocumentNumber(vault,'proforma')");
  assert.ok(reviewIndex>=0&&numberIndex>reviewIndex);
  assert.match(source,/buildQuoteAiReview\(scopeVault\(resumed\.vault\),quote\)/);
  assert.match(source,/applyQuoteAiPricingCommand\(scopeVault\(resumed\.vault\),quote,canonical\)/);
});

test('supplier AI imports and procurement comparisons cannot match catalog masters from a foreign workspace',async()=>{
  const {scopeVault}=await import('../dist/src/lib/workspaces.js');
  const vault=emptyVault();
  vault.suppliers=[
    {id:'supplier-local',workspaceId:'default',nameEn:'Local supplier',nameAr:''},
    {id:'supplier-foreign',workspaceId:'foreign',nameEn:'Foreign supplier',nameAr:''}
  ];
  vault.savedItems=[
    {id:'sku-local',workspaceId:'default',sku:'SCOPED-1',descriptionEn:'Local item'},
    {id:'sku-foreign',workspaceId:'foreign',sku:'SCOPED-2',descriptionEn:'Foreign item'}
  ];
  const scoped=scopeVault(vault);
  assert.deepEqual(scoped.suppliers.map(x=>x.id),['supplier-local']);
  assert.deepEqual(scoped.savedItems.map(x=>x.id),['sku-local']);
  const tools=[
    'src/components/AiWorkflowTools.tsx',
    'src/components/SupplierDocumentImport.tsx',
    'src/components/ProcurementAiCompare.tsx'
  ];
  for(const file of tools){
    const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.match(source,/scopeVault\(/,file+' must scope current master records before matching');
    assert.doesNotMatch(source,/buildAiSupplierPurchaseDraft\([^\n]*,vault\.suppliers,vault\.savedItems\)/,
      file+' must never match across all company masters at save');
  }
});

test('AI import saving authorizes explicit operational roles and rejects viewer or inactive operator',async()=>{
  const {assertAiImportSaveAllowed}=await import('../dist/src/lib/ai-import-authorization.js');
  const fixtures=[
    {role:'owner',quote:true,supplier:true},
    {role:'admin',quote:true,supplier:true},
    {role:'sales',quote:true,supplier:false},
    {role:'finance',quote:true,supplier:false},
    {role:'purchasing',quote:false,supplier:true},
    {role:'viewer',quote:false,supplier:false}
  ];
  for(const row of fixtures){
    const vault=emptyVault();
    vault.teamMembers=[{id:'operator',displayName:'Test operator',role:row.role,status:'active'}];
    vault.appSettings.activeTeamMemberId='operator';
    for(const [kind,allowed] of [['quotation-draft',row.quote],['supplier-purchase-draft',row.supplier]]){
      if(allowed)assert.doesNotThrow(()=>assertAiImportSaveAllowed(vault,kind),row.role+' must save '+kind);
      else assert.throws(()=>assertAiImportSaveAllowed(vault,kind),/cannot save this AI import/,row.role+' must be denied '+kind);
    }
    vault.teamMembers[0].status='inactive';
    for(const kind of ['quotation-draft','supplier-purchase-draft'])
      assert.throws(()=>assertAiImportSaveAllowed(vault,kind),/operator is unavailable/);
  }
});

test('all three AI import routes revalidate the selected operator inside the vault mutation',()=>{
  const components=['src/components/AiWorkflowTools.tsx','src/components/SupplierDocumentImport.tsx','src/components/ProcurementAiCompare.tsx'];
  for(const path of components){
    const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.match(source,/mutateVaultSafely\(vault=>\{assertAiImportSaveAllowed\(vault,/s.test(source)?/assertAiImportSaveAllowed\(vault,'(?:quotation-draft|supplier-purchase-draft)'\)/:/assertAiImportSaveAllowed\(vault,'(?:quotation-draft|supplier-purchase-draft)'\)/,
      path+' must enforce the operator role inside a save');
  }
  const inbox=readFileSync(new URL('../src/components/AiWorkflowTools.tsx',import.meta.url),'utf8');
  assert.match(inbox,/assertAiImportSaveAllowed\(vault,'quotation-draft'\);assertAiInboxQuoteReviewFresh/);
  assert.match(inbox,/assertAiImportSaveAllowed\(vault,'supplier-purchase-draft'\);const purchase=/);
});

test('draft numbering and offer comparison never include purchases from other branches',async()=>{
  const {buildAiSupplierPurchaseDraft}=await import('../dist/src/lib/ai-supplier-purchase-draft.js');
  const {scopeVault}=await import('../dist/src/lib/workspaces.js');
  const vault=emptyVault(),now=new Date().toISOString();
  vault.branches.push({id:'second',workspaceId:'default',name:'Second Branch',code:'SECOND',active:true,createdAt:now,updatedAt:now});
  vault.purchases=[
    {id:'main-p',number:'PUR-2026-0001',status:'draft',workspaceId:'default',branchId:'main'},
    {id:'branch-p',number:'PUR-2026-0099',status:'posted',workspaceId:'default',branchId:'second'},
    {id:'foreign-p',number:'PUR-2026-0500',status:'posted',workspaceId:'outside',branchId:'main'}
  ];
  const scoped=scopeVault(vault);
  assert.deepEqual(scoped.purchases.map(p=>p.id),['main-p']);
  const draft={supplierName:'No saved supplier',supplierTaxId:'',documentNumber:'PO-Test',date:'2026-10-14',
    currency:'USD',freight:'',duty:'',otherCosts:'',paymentTerms:'',notes:'',
    items:[{sku:'',descriptionEn:'One test line',descriptionAr:'',quantity:'3',unit:'CTN',unitCost:'9.5'}]};
  const purchase=buildAiSupplierPurchaseDraft(draft,scoped.purchases,scoped.suppliers,scoped.savedItems);
  assert.match(purchase.number,/^PUR-\d{4}-0002$/,'foreign company and branch records must not advance this branch numbering');
  const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const compare=read('src/components/ProcurementAiCompare.tsx');
  assert.match(compare,/buildProcurementDraftContext\(\{\.\.\.scoped,purchases:\[\.\.\.scoped\.purchases\.filter/);
  assert.doesNotMatch(compare,/resumed\.vault\.purchases\.filter\(p=>p\.status!=='draft'\)/,
    'comparison must not mix foreign branch procurement records');
  for(const path of ['src/components/AiWorkflowTools.tsx','src/components/SupplierDocumentImport.tsx','src/components/ProcurementAiCompare.tsx']){
    const source=read(path);
    assert.match(source,/buildAiSupplierPurchaseDraft\([^\n]*scoped\.purchases,scoped\.suppliers,scoped\.savedItems\)/,
      path+' must number and link against the current company and branch');
  }
});
