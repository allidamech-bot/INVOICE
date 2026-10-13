import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime} from '../dist/src/lib/ai-tool-orchestrator.js';
import {exactSpreadsheetQuote} from '../dist/src/lib/ai-spreadsheet-quote.js';
import {quoteSourceWorkingDraft} from '../dist/src/lib/ai-quote-source-draft.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';

const message='حوّل هذا الملف إلى عرض سعر';
const makeSource=(category='product_list',count=84)=>{
 const matrix=[['Product','Quantity','Unit','Price','Currency']];
 for(let i=0;i<count;i++)matrix.push(['Product '+String(i+1).padStart(3,'0'),'2','CTN','3.50','USD']);
 const sheet={name:'RFQ',matrix,nonEmptyRows:matrix.length,columnCount:5};
 const quoteSheetCandidate=JSON.stringify(exactSpreadsheetQuote([sheet]));
 return {id:'src-f09',fileName:'RFQ-84.xlsx',route:category,documentType:'ambiguous_catalog',
    confidence:0.12,extracted:JSON.stringify({items:[{descriptionEn:'Model summary only'}]}),
    quoteSheetCandidate};
};
function context(sources,mode='controller'){return {conversationMode:mode,conversationSources:sources,
 assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}};}
test('F09 model misclassifies RFQ as product catalog; explicit quote still stages all 84 rows without replanning',async()=>{
 const vault=emptyVault(),source=makeSource('product_list');
 const response=await orchestrateAiToolRequest({message,vault,context:context([source]),language:'ar'});
 assert.equal(response.proposal,null);assert.equal(response.plannedBy,'local');
 assert.equal(response.workingDraft.items.length,84);
 assert.equal(response.workingDraft.items[83].descriptionEn,'Product 084');
 assert.equal(response.workingDraft.customerDraft,null);
 assert.equal(response.workingDraft.currency,'USD');
 assert.equal(response.workingDraft.items.every(row=>row.quantity==='2'&&row.unitPrice==='3.50'),true);
 const kernel=newConversationKernel({scope:'business',workspaceId:'default',branchId:'main',threadId:'f09'});
 stageKernelArtifact(kernel,response.workingDraft);
 assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'588.00');
 assert.deepEqual(vault.documents,[]);
});
test('F09 unknown classifier also does not block complete exact spreadsheet source',async()=>{
 const vault=emptyVault(),source=makeSource('unknown',84);
 const response=await orchestrateAiToolRequest({message,vault,context:context([source]),language:'en'});
 assert.equal(response.workingDraft.items.length,84);
 assert.match(response.answer,/84/);
});
test('F09 catalog source without exact worksheet quote candidate stays outside quote conversion fast path',()=>{
 const vault=emptyVault(),runtime=createAiToolRuntime(vault,context([]));
 assert.equal(quoteSourceWorkingDraft([{fileName:'catalog.pdf',route:'product_list',documentType:'catalog',confidence:.99,extracted:'{}'}],runtime,message),null);
});
test('F09 analysis-only requests cannot stage worksheet quote and Advisor is read-only',async()=>{
 const vault=emptyVault(),source=makeSource();
 const runtime=createAiToolRuntime(vault,context([source]));
 assert.equal(quoteSourceWorkingDraft([source],runtime,'حلل الملف فقط'),null);
 assert.equal(quoteSourceWorkingDraft([source],createAiToolRuntime(vault,context([source],'advisor')),message),null);
});
test('F09 incomplete candidate fails closed, never falls back to misleading one-row model extraction',async()=>{
 const vault=emptyVault(),source=makeSource();
 source.quoteSheetCandidate='{"items":[';
 const outcome=await orchestrateAiToolRequest({message,vault,context:context([source]),language:'en'});
 assert.equal(outcome.workingDraft,undefined);assert.equal(outcome.proposal,null);
 assert.match(outcome.answer,/No quotation draft was prepared/);
 assert.equal(vault.documents.length,0);
});
test('F09 separate quote candidate survives nonquote classification without changing product import path',async()=>{
 const [read,tool]=await Promise.all([
  readFile(new URL('../src/lib/ai-conversation-attachments.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/lib/ai-tool-client.ts',import.meta.url),'utf8')
 ]);
 const initial=read.indexOf('let quoteSheetCandidate='),classification=read.indexOf("onProgress?.('classifying')");
 assert.ok(initial>0&&initial<classification);
 assert.match(read,/quoteSheetCandidate:quoteSheetCandidate\|\|undefined/);
 assert.match(read,/classification\.route==='quote_request'&&quoteSheetCandidate/);
 assert.match(read,/extracted=quoteSheetCandidate\|\|await genericExtraction/);
 assert.match(read,/if\(quoteSheetCandidate\)\{[\s\S]*?classification=\{route:'unknown',documentType:'exact-spreadsheet-columns',confidence:0/);
 assert.match(tool,/quoteSheetCandidate\.length>0/);
});
