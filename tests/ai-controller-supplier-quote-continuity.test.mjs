import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime} from '../dist/src/lib/ai-tool-orchestrator.js';
import {quoteSourceWorkingDraft} from '../dist/src/lib/ai-quote-source-draft.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
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
