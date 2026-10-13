import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime} from '../dist/src/lib/ai-tool-orchestrator.js';
import {exactSpreadsheetQuote} from '../dist/src/lib/ai-spreadsheet-quote.js';
import {quoteSourceWorkingDraft} from '../dist/src/lib/ai-quote-source-draft.js';
import {AI_WORKING_QUOTE_MAX_LINES,aiDraftUndoDepth} from '../dist/src/lib/ai-document-limits.js';
import {assertAiDocumentCreateApproval} from '../dist/src/lib/ai-document-approval-guard.js';
import {newConversationKernel,stageKernelArtifact,normalizeConversationKernel} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument,workspaceDrafting} from '../dist/src/lib/ai-workspace-model.js';
import {reviseKernelDraft} from '../dist/src/lib/ai-conversation-kernel.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';
const request='حوّل المرفق إلى عرض سعر';
const makeSheet=(count,name='Customer RFQ')=>{
  const matrix=[['Product','SKU','Quantity','Unit','Unit Price','Currency']];
  for(let i=0;i<count;i++)matrix.push(['Item '+String(i+1).padStart(3,'0'),'IT-'+i,'2','CTN','3.50','USD']);
  return{name,matrix,nonEmptyRows:matrix.length,columnCount:6};
};
function fixture(count=84){
 const vault=emptyVault();
 const runtime=createAiToolRuntime(vault,{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
 const parsed=exactSpreadsheetQuote([makeSheet(count)]);
 const source={fileName:'84-products.xlsx',route:'quote_request',documentType:'customer_rfq',confidence:1,extracted:JSON.stringify(parsed)};
 const working=quoteSourceWorkingDraft([source],runtime,request);
 return{vault,runtime,parsed,working,source};
}
test('F08 84-row Excel quote maps all exact rows, quantities and prices without writes or fake values',()=>{
 const {vault,parsed,working}=fixture(),before=structuredClone(vault);
 assert.equal(AI_WORKING_QUOTE_MAX_LINES,120);
 assert.equal(parsed.sourceRowCount,84);
 assert.equal(parsed.items.length,84);assert.equal(parsed.sheetCount,1);
 assert.equal(parsed.items[0].descriptionEn,'Item 001');
 assert.equal(parsed.items[83].descriptionEn,'Item 084');
 assert.deepEqual(working.items.map(r=>r.descriptionEn),parsed.items.map(r=>r.descriptionEn));
 assert.equal(working.items.length,84);assert.equal(working.currency,'USD');
 assert.equal(working.customerDraft,null);
 const kernel=newConversationKernel({scope:'business',workspaceId:'default',branchId:'main',threadId:'f08'});
 stageKernelArtifact(kernel,working);
 assert.equal(new Set(kernel.artifact.lineIds).size,84);
 assert.equal(workspaceDocument(kernel,vault,'en').rows.length,84);
 assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'588.00');
 assert.deepEqual(vault,before);
});
test('F08 saving 84 lines requires a real customer, but approval validation accepts every verified line',()=>{
 const {vault,working}=fixture();
 assert.throws(()=>assertAiDocumentCreateApproval(vault,working),/customer/);
 const complete={...working,customerDraft:{companyNameEn:'Explicit Buyer',companyNameAr:'',contactPerson:'',
  addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''}};
 assert.doesNotThrow(()=>assertAiDocumentCreateApproval(vault,complete));
 const k=newConversationKernel({scope:'business',workspaceId:'default',branchId:'main',threadId:'f08'});
 stageKernelArtifact(k,complete);
 const pdf=prepareAiPdfPreview(k,vault,'en');
 assert.equal(pdf.items.length,84);
 assert.equal(pdf.status,'draft');assert.equal(pdf.number,'UNSAVED-PREVIEW');
 assert.equal(vault.documents.length,0);assert.equal(vault.documentEvents.length,0);
});
test('F08 missing price never becomes zero and cannot be approved even when the remaining 83 rows have prices',()=>{
 const sheets=[makeSheet(84)];
 sheets[0].matrix[41][4]='';
 const parsed=exactSpreadsheetQuote(sheets);
 const {runtime,vault}=fixture();
 const working=quoteSourceWorkingDraft([{fileName:'missing-price.csv',route:'quote_request',documentType:'customer_rfq',confidence:1,extracted:JSON.stringify(parsed)}],runtime,request);
 assert.equal(working.items.length,84);assert.equal(working.items[40].unitPrice,'');
 working.customerDraft={companyNameEn:'Source Named Buyer',companyNameAr:'',contactPerson:'',
   addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
 assert.throws(()=>assertAiDocumentCreateApproval(vault,working),/selling price/);
});
test('F08 121 rows or an incomplete workbook abort rather than staging first 120',()=>{
 assert.throws(()=>exactSpreadsheetQuote([makeSheet(121)]),/More than 120/);
 const a=makeSheet(84);a.matrix[55][2]='';
 assert.throws(()=>exactSpreadsheetQuote([a]),/row 56/);
 const s=makeSheet(84),other={name:'Missed sheet',matrix:[['Unknown','Numbers'],['NOT INCLUDED','10']],nonEmptyRows:2,columnCount:2};
 assert.throws(()=>exactSpreadsheetQuote([s,other]),/Every nonempty worksheet/);
 assert.throws(()=>exactSpreadsheetQuote([other,s]),/Every nonempty worksheet/);
});
test('F08 source counts and mixed currencies fail closed',()=>{
 const {runtime,parsed,source}=fixture();
 const altered={...parsed,sourceRowCount:85};
 assert.throws(()=>quoteSourceWorkingDraft([{...source,extracted:JSON.stringify(altered)}],runtime,request),/row count/);
 const mixed=makeSheet(84);mixed.matrix[50][5]='EUR';
 assert.throws(()=>exactSpreadsheetQuote([mixed]),/Mixed currencies/);
 const ambiguous=makeSheet(84);ambiguous.matrix[10][2]='2 cartons x 24';
 assert.throws(()=>exactSpreadsheetQuote([ambiguous]),/Invalid quantity/);
});
test('F08 large draft history keeps bounded undo and identity through reload',()=>{
 const {vault,working}=fixture();const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'f08'};
 const kernel=newConversationKernel(scope);stageKernelArtifact(kernel,working);
 assert.equal(aiDraftUndoDepth(84),5);
 for(let i=0;i<8;i++){
   const revised=reviseKernelDraft(kernel,kernel.artifact.proposal,'غيّر سعر الصنف 84 إلى '+String(i+4),workspaceDrafting(vault),'ar');
   assert.equal(revised.changed,true);
 }
 assert.ok(kernel.artifact.undo.length<=5);
 const restored=normalizeConversationKernel(JSON.parse(JSON.stringify(kernel)),scope);
 assert.equal(restored.artifact.proposal.items.length,84);
 assert.equal(restored.artifact.lineIds.length,84);
 assert.equal(restored.artifact.proposal.items[83].unitPrice,'11');
 assert.deepEqual(vault.documents,[]);
});
