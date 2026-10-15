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
import {exactSpreadsheetQuote} from '../dist/src/lib/ai-spreadsheet-quote.js';

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

test('B1 supplier-classified exact worksheet cannot leak acquisition prices as customer prices',()=>{
  const vault=emptyVault();
  const matrix=[['SKU','Description','Quantity','Unit','Unit Price','Currency'],
    ['SUP-1','Industrial juice',2,'CTN',10,'USD'],
    ['SUP-2','Industrial water',3,'CTN',20,'USD']];
  const complete=JSON.stringify(exactSpreadsheetQuote([{name:'Supplier offer',matrix}]));
  const src={...supplierSource(2,'vendor.xlsx'),quoteSheetCandidate:complete,
    route:'supplier_purchase'};
  const empty=quoteSourceWorkingDraft([src],runtime(vault),request);
  assert.equal(empty.items.length,2);
  assert.deepEqual(empty.items.map(row=>row.unitPrice),['','']);
  assert.equal(empty.paymentTerms,'');
  assert.equal(empty.customerId,'');
  const priced=quoteSourceWorkingDraft([src],runtime(vault),'حوّل ملف المورد إلى عرض سعر وأضف 3% على الأسعار');
  assert.deepEqual(priced.items.map(row=>row.unitPrice),['10.30','20.60']);
  assert.equal(vault.documents.length,0);
});

test('B1 supplier Unit Cost XLSX retains all 85 source rows and requires explicit sell pricing',()=>{
  const vault=emptyVault(),before=structuredClone(vault);
  const matrix=[['SKU','Description','Quantity','Unit','Unit Cost','Currency'],
    ...Array.from({length:85},(_,i)=>['SKU-'+String(i+1).padStart(3,'0'),
      'Wholesale product '+String(i+1).padStart(3,'0'),2,'CTN','10.00','USD'])];
  const exact=exactSpreadsheetQuote([{name:'Vendor export',matrix}]);
  assert.equal(exact.items.length,85);
  assert.equal(exact.items[84].unitCost,'10.00');
  assert.equal(exact.items[84].unitPrice,'');
  assert.equal(exact.items[84].unitCostColumnPresent,true);
  const source={...supplierSource(1,'vendor-unit-cost.xlsx'),route:'supplier_purchase',
    quoteSheetCandidate:JSON.stringify(exact),extracted:'{"items":[{"sku":"WRONG MODEL ROW"}]}'};
  const draft=quoteSourceWorkingDraft([source],runtime(vault),request);
  assert.equal(draft.items.length,85);
  assert.equal(draft.items[84].descriptionEn,'Wholesale product 085');
  assert.ok(draft.items.every(row=>row.unitPrice===''),'source costs do not become buyer prices');
  const priced=quoteSourceWorkingDraft([source],runtime(vault),
    'حوّل فاتورة المورد إلى عرض سعر وأضف 3% على الأسعار');
  assert.equal(priced.items.length,85);
  assert.ok(priced.items.every(row=>row.unitPrice==='10.30'));
  const kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,priced);
  assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'1751.00');
  assert.deepEqual(vault,before);
});

test('B1 explicit supplier cost beats sale-price column, and blank cost fails closed',()=>{
  const vault=emptyVault(),matrix=[
    ['SKU','Description','Quantity','Unit','Unit Price','Unit Cost','Currency'],
    ['A-1','Mixed pricing',2,'CTN','30','10','USD'],
    ['A-2','Blank supplier cost',3,'CTN','40','','USD']
  ];
  const exact=exactSpreadsheetQuote([{name:'Pricing',matrix}]);
  assert.equal(exact.items[0].unitPrice,'30');
  assert.equal(exact.items[0].unitCost,'10');
  const source={...supplierSource(2,'both-columns.xlsx'),route:'supplier_purchase',
    quoteSheetCandidate:JSON.stringify(exact)};
  assert.deepEqual(quoteSourceWorkingDraft([source],runtime(vault),request).items.map(row=>row.unitPrice),['','']);
  assert.throws(()=>quoteSourceWorkingDraft([source],runtime(vault),
    'حوّل فاتورة المورد إلى عرض سعر وأضف 3% على الأسعار'),/supplier unit price is missing|unit price is missing/i);
  matrix[2][5]='12';
  const priced=quoteSourceWorkingDraft([{...source,
    quoteSheetCandidate:JSON.stringify(exactSpreadsheetQuote([{name:'Pricing',matrix}]))}],
    runtime(vault),'حوّل فاتورة المورد إلى عرض سعر وأضف 3% على الأسعار');
  assert.deepEqual(priced.items.map(row=>row.unitPrice),['10.30','12.36']);
  assert.deepEqual(vault.documents,[]);
});

test('B1 Arabic supplier purchase-cost column never becomes automatic selling price',()=>{
  const vault=emptyVault();
  const matrix=[['اسم الصنف','الكمية','الوحدة','سعر الشراء','العملة'],
    ['زيت دوار الشمس',12,'كرتون','7.50','USD']];
  const parsed=exactSpreadsheetQuote([{name:'سعر المورد',matrix}]);
  assert.equal(parsed.items[0].unitCost,'7.50');
  assert.equal(parsed.items[0].unitPrice,'');
  const fromBuyer={...supplierSource(1),route:'quote_request',quoteSheetCandidate:JSON.stringify(parsed)};
  const quoted=quoteSourceWorkingDraft([fromBuyer],runtime(vault),request);
  assert.equal(quoted.items[0].unitPrice,'','cost-only RFQ must not assume customer price');
  const supplier={...fromBuyer,route:'supplier_purchase'};
  assert.equal(quoteSourceWorkingDraft([supplier],runtime(vault),
    'حوّل فاتورة المورد إلى عرض سعر بهامش ربح 25%').items[0].unitPrice,'10.00');
  assert.deepEqual(vault.documents,[]);
});

test('B1 malformed supplier cost cell blocks whole exact worksheet, never drops later rows',()=>{
  const matrix=[['Product','Quantity','Unit Cost','Currency'],
    ['First',3,'7.25','USD'],['Second',2,'TBC','USD']];
  assert.throws(()=>exactSpreadsheetQuote([{name:'Incomplete supplier',matrix}]),/Invalid price.*row 3/);
});

test('B1 missing source currency blocks PDF until customer explicitly confirms an ISO code',()=>{
  const vault=emptyVault();
  const buyer={id:'qa-currency-buyer',workspaceId:'default',companyNameEn:'Currency Buyer',
    companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  vault.customers=[buyer];
  const before=structuredClone(vault);
  const draft=quoteSourceWorkingDraft([supplierSource(3,'no-currency.pdf','')],runtime(vault),withMargin);
  assert.equal(draft.currency,'');
  assert.ok(draft.items.every(row=>row.unitPrice==='12.50'));
  draft.customerId=buyer.id;
  const kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,draft);
  assert.ok(workspaceDocument(kernel,vault,'en').blockers.some(x=>/currency/.test(x)));
  assert.throws(()=>prepareAiPdfPreview(kernel,vault,'en'),/Complete all required document fields/);
  const confirmed=reviseKernelDraft(kernel,kernel.artifact.proposal,
    'حدّد العملة USD',workspaceDrafting(vault),'ar');
  assert.equal(confirmed.changed,true);
  assert.equal(kernel.artifact.proposal.currency,'USD');
  const pdf=prepareAiPdfPreview(kernel,vault,'en');
  assert.equal(pdf.currency,'USD');
  assert.equal(pdf.items.length,3);
  const revision=kernel.artifact.revision;
  for(const request of ['غيّر العملة EUR','set currency 1234','set currency USD4']){
    const denied=reviseKernelDraft(kernel,kernel.artifact.proposal,
      request,workspaceDrafting(vault),'en');
    assert.equal(denied.changed,false,request);
    assert.equal(kernel.artifact.revision,revision,'rejected request must not change revision');
    assert.equal(kernel.artifact.proposal.currency,'USD');
  }
  assert.equal(reviseKernelDraft(kernel,kernel.artifact.proposal,
    'undo',workspaceDrafting(vault),'en').changed,true);
  assert.equal(kernel.artifact.proposal.currency,'');
  assert.throws(()=>prepareAiPdfPreview(kernel,vault,'en'),/Complete all required document fields/);
  assert.deepEqual(vault,before,'source pricing and draft editing must not persist');
});

test('B1 currency can be corrected before prices are set, without implied FX conversion',()=>{
  const vault=emptyVault(),kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,quoteSourceWorkingDraft([supplierSource(3)],runtime(vault),request));
  assert.equal(kernel.artifact.proposal.currency,'USD');
  assert.ok(kernel.artifact.proposal.items.every(row=>row.unitPrice===''));
  const changed=reviseKernelDraft(kernel,kernel.artifact.proposal,
    'غيّر العملة EUR',workspaceDrafting(vault),'ar');
  assert.equal(changed.changed,true);
  assert.equal(kernel.artifact.proposal.currency,'EUR');
  assert.ok(kernel.artifact.proposal.items.every(row=>row.unitPrice===''));
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

test('B1 negated pricing requests never silently increase imported supplier costs',()=>{
  const vault=emptyVault(),source=[supplierSource(3)];
  for(const message of [
    'حوّل فاتورة المورد إلى عرض سعر لكن لا تضف 3% على الأسعار',
    'حوّل فاتورة المورد إلى عرض سعر بدون هامش ربح 20%',
    'حوّل فاتورة المورد إلى عرض سعر ولا تضف هامش ربح 20%',
    'convert supplier offer to quotation, do not add 3% to prices',
  ]){
    const draft=quoteSourceWorkingDraft(source,runtime(vault),message);
    assert.ok(draft,message);
    assert.deepEqual(draft.items.map(row=>row.unitPrice),['','',''],message);
    assert.equal(draft.customerId,'');
  }
  const explicit=quoteSourceWorkingDraft(source,runtime(vault),
    'حوّل فاتورة المورد إلى عرض سعر بدون هامش ربح 20%، وأضف 3% على الأسعار');
  assert.deepEqual(explicit.items.map(row=>row.unitPrice),['10.30','10.30','10.30']);
  assert.equal(requestedSourceMarkup('لا تضف 3% على الأسعار'),null);
  assert.equal(requestedSourceMarkup('do not add 3% to prices'),null);
  assert.deepEqual(vault.documents,[]);
});

test('B1 a negated bulk edit is refused rather than forwarded to a model or applied',()=>{
  const vault=emptyVault(),kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,quoteSourceWorkingDraft([supplierSource(3)],runtime(vault),withMargin));
  const before=structuredClone(kernel);
  for(const phrase of ['لا تضف 3% على الأسعار','ولا تضف 3% على الأسعار','do not add 3% to prices']){
    const result=reviseKernelDraft(kernel,kernel.artifact.proposal,phrase,workspaceDrafting(vault),'ar');
    assert.equal(result.changed,false,phrase);
    assert.match(result.message,/explicitly negated/i);
    assert.deepEqual(kernel,before,'negated edit did not even stage a new revision');
  }
  assert.deepEqual(vault.documents,[]);
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


test('B1 source quote allows deterministic edits and removal of line 120 without touching the vault',()=>{
  const vault=emptyVault(),before=structuredClone(vault);
  const draft=quoteSourceWorkingDraft([supplierSource(120)],runtime(vault),withMargin);
  assert.equal(draft.items.length,120,'maximum supported source must stay complete');
  const kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,draft);
  const drafting=workspaceDrafting(vault);
  assert.equal(reviseKernelDraft(kernel,kernel.artifact.proposal,
    'غيّر سعر البند ١٢٠ إلى 15',drafting,'ar').changed,true);
  assert.equal(kernel.artifact.proposal.items[119].unitPrice,'15');
  assert.equal(kernel.artifact.proposal.items[118].unitPrice,'12.50');
  assert.equal(reviseKernelDraft(kernel,kernel.artifact.proposal,
    'change price line 100 to 14',drafting,'en').changed,true);
  assert.equal(kernel.artifact.proposal.items[99].unitPrice,'14');
  const invalid=structuredClone(kernel);
  const outside=reviseKernelDraft(kernel,kernel.artifact.proposal,
    'غيّر سعر البند 121 إلى 5',drafting,'ar');
  assert.equal(outside.changed,false,'never redirect an out-of-range row to an arbitrary line');
  assert.deepEqual(kernel,invalid);
  assert.equal(reviseKernelDraft(kernel,kernel.artifact.proposal,
    'undo',drafting,'en').changed,true);
  assert.equal(kernel.artifact.proposal.items[99].unitPrice,'12.50');
  assert.equal(reviseKernelDraft(kernel,kernel.artifact.proposal,
    'redo',drafting,'en').changed,true);
  assert.equal(kernel.artifact.proposal.items[99].unitPrice,'14');
  assert.equal(reviseKernelDraft(kernel,kernel.artifact.proposal,
    'احذف البند رقم ١٢٠',drafting,'ar').changed,true);
  assert.equal(kernel.artifact.proposal.items.length,119);
  assert.equal(kernel.artifact.proposal.items.at(-1).descriptionEn,'Supplier product 119');
  assert.equal(reviseKernelDraft(kernel,kernel.artifact.proposal,
    'undo',drafting,'ar').changed,true);
  assert.equal(kernel.artifact.proposal.items.length,120);
  assert.equal(kernel.artifact.proposal.items.at(-1).descriptionEn,'Supplier product 120');
  assert.deepEqual(vault,before,'in-chat operations must never save or mutate accounting data');
});


test('B1 row edits accept the draft currency beyond four hard-coded codes',()=>{
  const vault=emptyVault(),before=structuredClone(vault);
  const draft=quoteSourceWorkingDraft([supplierSource(3,'supplier-aed.xlsx','AED')],runtime(vault),withMargin);
  assert.equal(draft.currency,'AED');
  const kernel=newConversationKernel(scope);
  stageKernelArtifact(kernel,draft);
  const drafting=workspaceDrafting(vault);
  assert.equal(reviseKernelDraft(kernel,kernel.artifact.proposal,
    'غيّر سعر البند 3 إلى 15 AED',drafting,'ar').changed,true);
  assert.equal(kernel.artifact.proposal.items[2].unitPrice,'15');
  const after=structuredClone(kernel);
  const mismatch=reviseKernelDraft(kernel,kernel.artifact.proposal,
    'change price line 2 to 17 USD',drafting,'en');
  assert.equal(mismatch.changed,false);
  assert.match(mismatch.message,/currency differs/i);
  assert.deepEqual(kernel,after,'a mismatched currency must not alter the draft');
  assert.deepEqual(vault,before,'a price revision never updates the stored accounting records');
});
