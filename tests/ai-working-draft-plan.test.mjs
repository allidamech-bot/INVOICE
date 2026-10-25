import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {applyWorkingDraftPlan} from '../dist/src/lib/ai-working-draft-plan.js';
import {workspaceDocument,applyWorkspaceCommand} from '../dist/src/lib/ai-workspace-model.js';
import {exactSpreadsheetQuote} from '../dist/src/lib/ai-spreadsheet-quote.js';
import {quoteSourceWorkingDraft} from '../dist/src/lib/ai-quote-source-draft.js';
import {createAiToolRuntime} from '../dist/src/lib/ai-tool-orchestrator.js';
import {planWorkingDraft} from '../api/_ai/draft-plan.js';
function fixture(items=Array.from({length:85},(_,i)=>['Product '+(i+1),'2','CTN','10','USD'])){
 const vault=emptyVault(),kernel=newConversationKernel({accountId:'qa',scope:'business',workspaceId:'default',branchId:'main',threadId:'qa'});
 const matrix=[['Product','Quantity','Unit','Unit Price','Currency'],...items];
 const source=JSON.stringify(exactSpreadsheetQuote([{name:'Products',matrix}]));
 const runtime=createAiToolRuntime(vault,{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
 stageKernelArtifact(kernel,quoteSourceWorkingDraft([{fileName:'products.xlsx',route:'quote_request',confidence:1,extracted:source}],runtime,'convert this file to a quotation'));
 const plan={artifactId:kernel.artifact.id,revision:kernel.artifact.revision,action:'edit',operations:[{lineId:kernel.artifact.lineIds[2],field:'unitPrice',value:'26',evidence:'٢٦'}]};
 return {vault,kernel,plan};
}
test('explicit Arabic four and six ground atomic price and quantity patches without financial persistence',()=>{
 const {vault,kernel,plan}=fixture([['Test Box','12','PCS','3.50','USD'],['Test Bag','4','PCS','2','USD']]),before=structuredClone(vault),originalKernel=structuredClone(kernel);
 plan.operations=[{lineId:kernel.artifact.lineIds[0],field:'unitPrice',value:'4',evidence:'أربعة دولارات'},{lineId:kernel.artifact.lineIds[1],field:'quantity',value:'6',evidence:'ستة PCS'}];
 const next=applyWorkingDraftPlan(kernel,vault,plan,'في نفس المسودة فقط، خلي سعر Test Box أربعة دولارات بدل 3.50 وخلي كمية Test Bag ستة PCS بدل أربعة. أعد حساب الإجمالي واعرض النتيجة للمراجعة دون حفظ أو إصدار.');
 const doc=workspaceDocument(next,vault,'en');
 assert.equal(doc.rows[0].unitPrice,'4');assert.equal(doc.rows[1].quantity,'6');
 assert.equal(doc.rows.length,2);assert.equal(doc.rows[0].quantity,'12');assert.equal(doc.rows[1].unitPrice,'2');assert.equal(doc.subtotal,'60.00');
 assert.equal(next.artifact.revision,kernel.artifact.revision+1);assert.equal(next.artifact.undo.length,1);
 assert.deepEqual(vault,before);
 for(const evidence of ['أربعة عشر','أربعة آلاف','سالب أربعة','أربعة ونصف','أربعة بالمئة','أربعة بدل ستة']){
  const invalid=structuredClone(plan);invalid.operations[0].evidence=evidence;
  assert.throws(()=>applyWorkingDraftPlan(kernel,vault,invalid,evidence+' وكمية الثاني ستة PCS'));
 }
 const fabricated=structuredClone(plan);fabricated.operations[1].value='7';
 assert.throws(()=>applyWorkingDraftPlan(kernel,vault,fabricated,'أربعة دولارات ستة PCS'));
 assert.deepEqual(kernel,originalKernel);assert.deepEqual(vault,before);
});
test('85 extracted rows survive a model patch, recalculation and one-step undo/redo without persistence',()=>{
 const {vault,kernel,plan}=fixture(),before=structuredClone(vault);
 const next=applyWorkingDraftPlan(kernel,vault,plan,'خلي سعر الثالث ٢٦');
 assert.equal(next.artifact.proposal.items.length,85);
 assert.equal(workspaceDocument(next,vault,'en').subtotal,'1732.00');
 assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'1700.00');
 assert.deepEqual(next.artifact.lineIds,kernel.artifact.lineIds);
 assert.equal(next.artifact.undo.length,1);
 applyWorkspaceCommand(next,vault,{kind:'undo',artifactId:next.artifact.id,revision:next.artifact.revision});
 assert.equal(workspaceDocument(next,vault,'en').subtotal,'1700.00');
 applyWorkspaceCommand(next,vault,{kind:'redo',artifactId:next.artifact.id,revision:next.artifact.revision});
 assert.equal(workspaceDocument(next,vault,'en').subtotal,'1732.00');
 assert.deepEqual(vault,before);
});
test('source quotation applies an explicitly requested 10% gross margin to all 85 rows, without mutation',()=>{
 const {vault}=fixture(),before=structuredClone(vault);
 const matrix=[['Product','Quantity','Unit','Unit Price','Currency'],...Array.from({length:85},(_,i)=>['Product '+(i+1),'2','CTN','10','USD'])];
 const rows=exactSpreadsheetQuote([{name:'Products',matrix}]);
 const runtime=createAiToolRuntime(vault,{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
 const makeSource=data=>[{fileName:'supplier.xlsx',route:'quote_request',confidence:1,extracted:JSON.stringify(data)}];
 const full=quoteSourceWorkingDraft(makeSource(rows),runtime,'حوّل هذا الملف إلى عرض سعر، أضف هامش ربح 10%');
 assert.equal(full.items.length,85);
 assert.ok(full.items.every(row=>row.unitPrice==='11.12'));
 assert.match(full.rationale,/10% gross margin/);
 assert.equal(quoteSourceWorkingDraft(makeSource(rows),runtime,'convert this file to a quotation').items[2].unitPrice,'10');
 assert.throws(()=>quoteSourceWorkingDraft(makeSource({...rows,items:rows.items.map((row,i)=>i===4?{...row,unitPrice:''}:row)}),runtime,'حوّل الملف إلى عرض سعر، أضف هامش ربح 10%'),/SOURCE_INCOMPLETE/);
 assert.throws(()=>quoteSourceWorkingDraft(makeSource(rows),runtime,'حوّل الملف إلى عرض سعر، أضف هامش ربح 100%'),/SOURCE_INCOMPLETE/);
 assert.deepEqual(vault,before,'unsaved price calculation must not change the source vault');
});
test('stale, fabricated, negative, cross-scope and Advisor patches are refused atomically',()=>{
 for(const mutate of [p=>p.revision++,p=>p.operations[0].lineId='foreign',p=>p.operations[0].value='99',p=>p.operations.push({...p.operations[0],lineId:'foreign'}),p=>p.operations[0].field='status']){
  const {vault,kernel,plan}=fixture(),before=structuredClone(kernel);mutate(plan);
  assert.throws(()=>applyWorkingDraftPlan(kernel,vault,plan,'خلي سعر الثالث ٢٦'));assert.deepEqual(kernel,before);
 }
 const {vault,kernel,plan}=fixture();plan.operations[0].evidence='-26';
 assert.throws(()=>applyWorkingDraftPlan(kernel,vault,plan,'change to -26'));
 plan.operations[0].evidence='٢٦';kernel.mode='advisor';assert.throws(()=>applyWorkingDraftPlan(kernel,vault,plan,'٢٦'));
 kernel.mode='controller';kernel.scope.branchId='foreign';assert.throws(()=>applyWorkingDraftPlan(kernel,vault,plan,'٢٦'));
});
test('multi-cell model edits make one undo revision, preserve untouched lines and require exact evidence',()=>{
 const {vault,kernel,plan}=fixture();plan.operations.push({lineId:kernel.artifact.lineIds[4],field:'quantity',value:'5',evidence:'5'});
 const next=applyWorkingDraftPlan(kernel,vault,plan,'الثالث ٢٦ والخامس 5');
 assert.equal(next.artifact.revision,kernel.artifact.revision+1);assert.equal(next.artifact.undo.length,1);
 assert.deepEqual(next.artifact.proposal.items[3],kernel.artifact.proposal.items[3]);
 applyWorkspaceCommand(next,vault,{kind:'undo',artifactId:next.artifact.id,revision:next.artifact.revision});
 assert.deepEqual(next.artifact.proposal,kernel.artifact.proposal);
});
test('server rejects Advisor planning and invalid documents before contacting a provider',async()=>{
 assert.equal((await planWorkingDraft({conversationMode:'advisor'})).status,403);
 assert.equal((await planWorkingDraft({conversationMode:'controller',scope:'business',message:'edit'})).status,400);
});
