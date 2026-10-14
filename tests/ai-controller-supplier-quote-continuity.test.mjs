import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime} from '../dist/src/lib/ai-tool-orchestrator.js';
import {quoteSourceWorkingDraft} from '../dist/src/lib/ai-quote-source-draft.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {newConversationKernel,stageKernelArtifact,normalizeConversationKernel,reviseKernelDraft} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDrafting} from '../dist/src/lib/ai-workspace-model.js';
import {requestedSourceMarkup} from '../dist/src/lib/ai-quote-source-draft.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';

const metadata={scope:'business',workspaceId:'default',branchId:'main'};
const scope={...metadata,threadId:'supplier-conversion'};
const runtime=(vault,mode='controller')=>createAiToolRuntime(vault,{conversationMode:mode,assistantRuntime:metadata});
const request='حوّل فاتورة المورد إلى عرض سعر';
const withMargin=request+' بهامش ربح 20%';

function supplierSource(count=24,fileName='supplier-offer.pdf',currency='USD'){
  const items=Array.from({length:count},(_,index)=>({
    sku:'SUP-'+(index+1),descriptionEn:'Supplier product '+(index+1),
    descriptionAr:'',quantity:'2',unit:'CTN',unitCost:'10.00'
  }));
  return {fileName,route:'supplier_purchase',documentType:'supplier_quote',
    confidence:0.96,extracted:JSON.stringify({
      supplierName:'Vendor Company',currency,paymentTerms:'PREPAY supplier',
      notes:'Supplier confidential discount; do not publish',customerName:'Injected Buyer',
      items,sourceRowCount:items.length
    })};
}

test('supplier offer becomes a complete unsaved customer quote without copying cost or supplier terms',async()=>{
  const vault=emptyVault(),before=structuredClone(vault),sources=[supplierSource()];
  const result=await orchestrateAiToolRequest({
    message:request,vault,
    context:{conversationMode:'controller',assistantRuntime:metadata,conversationSources:sources},language:'ar'
  });
  assert.equal(result.plannedBy,'local');
  assert.equal(result.proposal,null);
  assert.equal(result.plan.calls.length,0);
  assert.equal(result.workingDraft?.items.length,24);
  assert.equal(result.workingDraft.kind,'proforma');
  assert.equal(result.workingDraft.currency,'USD');
  assert.ok(result.workingDraft.items.every(row=>row.unitPrice===''));
  assert.equal(result.workingDraft.items[23].descriptionEn,'Supplier product 24');
  assert.equal(result.workingDraft.customerId,'');
  assert.equal(result.workingDraft.customerDraft,null);
  assert.equal(result.workingDraft.paymentTerms,'');
  assert.equal(result.workingDraft.notes,'');
  assert.match(result.answer,/تكلفة المورد/);
  const kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,result.workingDraft);
  assert.equal(kernel.artifact.proposal.items.length,24);
  assert.equal(workspaceDocument(kernel,vault,'ar').rows.length,24);
  assert.throws(()=>prepareAiPdfPreview(kernel,vault,'ar'),/Complete all required document fields/);
  assert.deepEqual(vault,before);
});

test('explicit 20 percent gross margin computes selling prices, not a 20 percent markup',()=>{
  const vault=emptyVault(),draft=quoteSourceWorkingDraft([supplierSource(3)],runtime(vault),withMargin);
  assert.ok(draft);
  assert.deepEqual(draft.items.map(row=>row.unitPrice),['12.50','12.50','12.50']);
  assert.equal(draft.customerDraft,null);
  assert.equal(draft.paymentTerms,'');
  assert.match(draft.rationale,/gross margin/);
  assert.equal(vault.documents.length,0);
});

test('explicit 3 percent markup produces 10.30, not a 3 percent gross-margin price',()=>{
  const vault=emptyVault();
  const draft=quoteSourceWorkingDraft([supplierSource(3)],runtime(vault),'حوّل عرض المورد إلى عرض سعر وأضف 3% على الأسعار');
  assert.ok(draft);
  assert.deepEqual(draft.items.map(row=>row.unitPrice),['10.30','10.30','10.30']);
  assert.match(draft.rationale,/3% markup/);
  assert.throws(()=>quoteSourceWorkingDraft([supplierSource(2)],runtime(vault),
    'حوّل عرض المورد إلى عرض سعر بهامش ربح 20% وأضف 3% على الأسعار'),/gross margin OR markup/);
  assert.deepEqual(vault.documents,[]);
});

test('B1 markup parser requires a price reference and distinguishes both word orders',()=>{
  assert.equal(requestedSourceMarkup('أضف 3% على جميع الأسعار'),'3');
  assert.equal(requestedSourceMarkup('زود الأسعار بنسبة ٣٪'),'3');
  assert.equal(requestedSourceMarkup('increase all prices by 3%'),'3');
  assert.equal(requestedSourceMarkup('أضف 3% ضريبة'),null);
  assert.equal(requestedSourceMarkup('أضف 3%'),null);
  assert.equal(requestedSourceMarkup('احذف الصنف 3'),null);
});

test('B1 multi-turn supplier quote reprices ALL 24 lines and undo/redo survives reload',()=>{
  const vault=emptyVault(),before=structuredClone(vault);
  const draft=quoteSourceWorkingDraft([supplierSource(24)],runtime(vault),withMargin);
  const kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,draft);
  assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'600.00');
  const originalIds=[...kernel.artifact.lineIds];
  const edit=reviseKernelDraft(kernel,kernel.artifact.proposal,'في نفس المسودة، أضف 3% على الأسعار',workspaceDrafting(vault),'ar');
  assert.equal(edit.changed,true);
  assert.equal(kernel.artifact.proposal.items.length,24);
  assert.ok(kernel.artifact.proposal.items.every(row=>row.unitPrice==='12.88'));
  assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'618.24');
  assert.deepEqual(kernel.artifact.lineIds,originalIds);
  assert.equal(kernel.artifact.undo.length,1);
  const loaded=normalizeConversationKernel(JSON.parse(JSON.stringify(kernel)),scope);
  assert.ok(loaded.artifact.proposal.items.every(row=>row.unitPrice==='12.88'));
  assert.equal(reviseKernelDraft(loaded,loaded.artifact.proposal,'undo',workspaceDrafting(vault),'ar').changed,true);
  assert.ok(loaded.artifact.proposal.items.every(row=>row.unitPrice==='12.50'));
  assert.equal(workspaceDocument(loaded,vault,'en').subtotal,'600.00');
  assert.equal(reviseKernelDraft(loaded,loaded.artifact.proposal,'redo',workspaceDrafting(vault),'ar').changed,true);
  assert.equal(workspaceDocument(loaded,vault,'en').subtotal,'618.24');
  assert.deepEqual(vault,before,'only scoped in-chat quote was changed');
});

test('B1 exact customer selection in chat completes supplier quotation PDF without saving',()=>{
  const vault=emptyVault(),buyer={id:'qa-b1-buyer',workspaceId:'default',
    companyNameEn:'Verified Buyer',companyNameAr:'',contactPerson:'',addressEn:'',
    addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',
    commercialRegistration:''};
  vault.customers=[buyer];
  const before=structuredClone(vault);
  const draft=quoteSourceWorkingDraft([supplierSource(3)],runtime(vault),withMargin);
  const kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,draft);
  assert.equal(reviseKernelDraft(kernel,kernel.artifact.proposal,
    'عيّن العميل Verified Buyer',workspaceDrafting(vault),'ar').changed,true);
  assert.equal(kernel.artifact.proposal.customerId,buyer.id);
  assert.equal(kernel.artifact.proposal.customerDraft,null);
  const pdf=prepareAiPdfPreview(kernel,vault,'ar');
  assert.equal(pdf.number,'UNSAVED-PREVIEW');
  assert.equal(pdf.items.length,3);
  assert.equal(pdf.items[2].unitPrice,'12.50');
  assert.equal(reviseKernelDraft(kernel,kernel.artifact.proposal,
    'undo',workspaceDrafting(vault),'ar').changed,true);
  assert.equal(kernel.artifact.proposal.customerId,'');
  assert.deepEqual(vault,before);
});

test('B1 missing, duplicate and foreign company customer identities never change the draft',()=>{
  const vault=emptyVault(),buyer=id=>({id,workspaceId:'default',companyNameEn:'Same Buyer',
    companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:''});
  vault.customers=[buyer('qa-one'),buyer('qa-two'),{...buyer('qa-other'),workspaceId:'other',companyNameEn:'Foreign Buyer'}];
  const draft=quoteSourceWorkingDraft([supplierSource(2)],runtime(vault),withMargin);
  const kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,draft);
  const before=structuredClone(kernel);
  for(const command of ['عيّن العميل Same Buyer','عيّن العميل Foreign Buyer','عيّن العميل Unknown Buyer']){
    const attempt=reviseKernelDraft(kernel,kernel.artifact.proposal,command,workspaceDrafting(vault),'ar');
    assert.equal(attempt.changed,false);
    assert.deepEqual(kernel,before);
  }
  assert.deepEqual(vault.documents,[]);
});

test('B1 incomplete or invalid customer prices reject a bulk repricing atomically',()=>{
  const vault=emptyVault();
  const draft=quoteSourceWorkingDraft([supplierSource(24)],runtime(vault),request);
  const kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,draft);
  const before=structuredClone(kernel);
  const edited=reviseKernelDraft(kernel,kernel.artifact.proposal,'أضف 3% على الأسعار',workspaceDrafting(vault),'ar');
  assert.equal(edited.changed,false);
  assert.match(edited.message,/Line 1/);
  assert.deepEqual(kernel,before);
  assert.equal(kernel.artifact.proposal.items.length,24);
  assert.deepEqual(vault.documents,[]);
});

test('B1 unrelated percentage does not edit a working document',()=>{
  const vault=emptyVault();
  const draft=quoteSourceWorkingDraft([supplierSource(4)],runtime(vault),withMargin);
  const kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,draft);
  const before=structuredClone(kernel);
  const edited=reviseKernelDraft(kernel,kernel.artifact.proposal,'أضف ضريبة 3%',workspaceDrafting(vault),'ar');
  assert.equal(edited,null);
  assert.deepEqual(kernel,before);
});

test('missing or invalid supplier costs never fabricate a requested margin or drop later rows',()=>{
  const vault=emptyVault(),src=supplierSource(24);
  const parsed=JSON.parse(src.extracted);
  parsed.items[23].unitCost='';
  src.extracted=JSON.stringify(parsed);
  assert.throws(()=>quoteSourceWorkingDraft([src],runtime(vault),withMargin),/unit price is missing/);
  parsed.items[23].unitCost='invalid';
  src.extracted=JSON.stringify(parsed);
  assert.throws(()=>quoteSourceWorkingDraft([src],runtime(vault),request),/missing or invalid quantity or price/);
  assert.deepEqual(vault.documents,[]);
});

test('unverified catalogue, unclear classification or advisor cannot become a customer quote',()=>{
  const vault=emptyVault(),src=supplierSource(2);
  assert.equal(quoteSourceWorkingDraft([{...src,route:'product_list'}],runtime(vault),request),null);
  assert.throws(()=>quoteSourceWorkingDraft([{...src,confidence:0.4}],runtime(vault),request),/classification is uncertain/);
  assert.equal(quoteSourceWorkingDraft([src],runtime(vault,'advisor'),request),null);
  assert.equal(quoteSourceWorkingDraft([src],runtime(vault),'حلل مستند المورد'),null);
  assert.deepEqual(vault.documents,[]);
});

test('multiple supplier offers require explicit one-quote instruction and reject mixed currency',()=>{
  const vault=emptyVault(),a=supplierSource(15,'vendor-a.pdf'),b=supplierSource(9,'vendor-b.pdf');
  assert.throws(()=>quoteSourceWorkingDraft([a,b],runtime(vault),request),/explicit request for one combined quotation/);
  const joined=quoteSourceWorkingDraft([a,b],runtime(vault),'ادمج الملفين في عرض سعر موحد بهامش ربح 20%');
  assert.equal(joined.items.length,24);
  assert.equal(joined.items[23].descriptionEn,'Supplier product 9');
  assert.ok(joined.items.every(row=>row.unitPrice==='12.50'));
  assert.throws(()=>quoteSourceWorkingDraft([a,supplierSource(9,'vendor-b.pdf','EUR')],runtime(vault),'ادمج الملفين في عرض سعر موحد'),/different currency/);
  assert.deepEqual(vault.documents,[]);
});
