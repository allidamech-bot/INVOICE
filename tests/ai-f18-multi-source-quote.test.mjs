import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {exactSpreadsheetQuote} from '../dist/src/lib/ai-spreadsheet-quote.js';
import {createAiToolRuntime} from '../dist/src/lib/ai-tool-orchestrator.js';
import {quoteSourceWorkingDraft,explicitQuoteConversionIntent} from '../dist/src/lib/ai-quote-source-draft.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';

const message='ادمج هذه الملفات الثلاثة في عرض سعر موحد';
const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'multi-rfq'};
const metadata={scope:'business',workspaceId:'default',branchId:'main'};
const runtime=vault=>createAiToolRuntime(vault,{conversationMode:'controller',assistantRuntime:metadata});
function source(part,count,start=1,currency='USD'){
 const matrix=[['Product','Quantity','Unit','Price','Currency']];
 for(let i=0;i<count;i++)matrix.push(['Product '+String(start+i).padStart(3,'0'),'2','CTN','3.50',currency]);
 const extracted=JSON.stringify(exactSpreadsheetQuote([{name:'RFQ',matrix,nonEmptyRows:matrix.length,columnCount:5}]));
 return{fileName:'source-'+part+'.xlsx',route:'product_list',documentType:'catalog',confidence:0.2,
    extracted:'{"items":[{"descriptionEn":"Model partial output"}]}',
    quoteSheetCandidate:extracted};
}
const sources=()=>[source(1,30,1),source(2,30,31),source(3,24,61)];
test('F18 explicit unified 3-file quote retains exactly 84 complete rows in original attachment order',async()=>{
 const vault=emptyVault(),before=structuredClone(vault),parts=sources();
 assert.equal(explicitQuoteConversionIntent(message),true);
 const draft=quoteSourceWorkingDraft(parts,runtime(vault),message);
 assert.equal(draft.items.length,84);
 assert.equal(draft.items[0].descriptionEn,'Product 001');
 assert.equal(draft.items[29].descriptionEn,'Product 030');
 assert.equal(draft.items[30].descriptionEn,'Product 031');
 assert.equal(draft.items[83].descriptionEn,'Product 084');
 assert.equal(draft.currency,'USD');
 assert.equal(draft.customerDraft,null);
 const kernel=newConversationKernel(scope);stageKernelArtifact(kernel,draft);
 assert.equal(new Set(kernel.artifact.lineIds).size,84);
 assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'588.00');
 assert.equal(prepareAiPdfPreview(kernel,vault,'en').items.length,84);
 assert.deepEqual(vault,before);
 assert.equal(vault.documentEvents.length,0);
 const routed=await orchestrateAiToolRequest({message,vault,context:{conversationMode:'controller',assistantRuntime:metadata,conversationSources:parts},language:'ar'});
 assert.equal(routed.proposal,null);
 assert.equal(routed.workingDraft.items.length,84);
 assert.equal(routed.plannedBy,'local');
});
test('F18 model misclassification cannot prevent multi-source quote when exact worksheet evidence exists',()=>{
 const vault=emptyVault();
 const parts=sources();parts[1].route='unknown';parts[2].route='quote_request';
 assert.equal(quoteSourceWorkingDraft(parts,runtime(vault),message).items.length,84);
});
test('F18 mixed source currencies, customer names or terms abort entire quote, no inferred values',()=>{
 const vault=emptyVault(),parts=sources();
 const currencyParts=[parts[0],source(2,30,31,'EUR'),parts[2]];
 assert.throws(()=>quoteSourceWorkingDraft(currencyParts,runtime(vault),message),/different currency/);
 const customerParts=sources();
 const data=JSON.parse(customerParts[1].quoteSheetCandidate);data.customerName='Other Buyer';
 customerParts[1].quoteSheetCandidate=JSON.stringify(data);
 assert.throws(()=>quoteSourceWorkingDraft(customerParts,runtime(vault),message),/different customerDraft/);
 const termParts=sources();const payment=JSON.parse(termParts[2].quoteSheetCandidate);payment.paymentTerms='Net 30';termParts[2].quoteSheetCandidate=JSON.stringify(payment);
 assert.throws(()=>quoteSourceWorkingDraft(termParts,runtime(vault),message),/different paymentTerms/);
 assert.deepEqual(vault.documents,[]);
});
test('F18 never drops source rows to fit max capacity, even if each attachment is individually valid',()=>{
 const vault=emptyVault(),parts=[source('a',60,1),source('b',61,61)];
 assert.throws(()=>quoteSourceWorkingDraft(parts,runtime(vault),message),/121 lines, exceeding 120/);
 assert.equal(vault.documents.length,0);
});
test('F18 no implicit merging, duplicate file double counting or non-RFQ source contamination',()=>{
 const vault=emptyVault(),parts=sources();
 assert.throws(()=>quoteSourceWorkingDraft(parts,runtime(vault),'حوّل الملفات إلى عرض سعر'),/explicit request for one combined quotation/);
 assert.throws(()=>quoteSourceWorkingDraft([parts[0],parts[0]],runtime(vault),message),/identical source file/);
 const unrelated={fileName:'unclassified.txt',route:'unknown',documentType:'unknown',confidence:0,extracted:'{}'};
 assert.throws(()=>quoteSourceWorkingDraft([...parts,unrelated],runtime(vault),message),/Attachment 4 is not a complete quotation/);
});
test('F18 Advisor or personal mode never assemble quote from uploaded documents',()=>{
 const vault=emptyVault(),parts=sources();
 assert.equal(quoteSourceWorkingDraft(parts,createAiToolRuntime(vault,{conversationMode:'advisor',assistantRuntime:metadata}),message),null);
 assert.equal(quoteSourceWorkingDraft(parts,createAiToolRuntime(vault,{conversationMode:'controller',assistantRuntime:{scope:'personal'}}),message),null);
});
