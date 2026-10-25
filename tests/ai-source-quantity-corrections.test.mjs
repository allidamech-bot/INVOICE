import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime} from '../dist/src/lib/ai-tool-orchestrator.js';
import {quoteSourceWorkingDraft} from '../dist/src/lib/ai-quote-source-draft.js';
import {orchestrateAiToolRequest} from '../dist/src/lib/ai-tool-client.js';

const message='جهّز مسودة عرض سعر من ملف PDF وصورة التصحيح المرفقين. اعتمد الكميات المصححة في الصورة. لا تخترع السعر الناقص ولا تحفظ أي سجل.';
const runtime=vault=>createAiToolRuntime(vault,{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
function sources(){return [8,10].map((q,i)=>({fileName:i?'correction.png':'original.pdf',route:'quote_request',documentType:'rfq',confidence:.95,extracted:JSON.stringify({currency:'USD',deliveryTime:'8 days',items:[{sku:'QA-A',quantity:String(q),unit:'PCS',unitPrice:'1.25'},{sku:'QA-B',quantity:'5',unit:'PCS',unitPrice:''}]})}));}
function change(s,index,fn){const d=JSON.parse(s[index].extracted);fn(d);s[index].extracted=JSON.stringify(d);return s;}
test('explicit corrected image quantities replace matched rows without doubling lines or inventing price',()=>{
 const vault=emptyVault(),before=structuredClone(vault),s=sources(),evidence=structuredClone(s);
 const draft=quoteSourceWorkingDraft(s,runtime(vault),message);
 assert.equal(draft.items.length,2);
 assert.deepEqual(draft.items.map(x=>[x.descriptionEn,x.quantity,x.unitPrice]),[['QA-A','10','1.25'],['QA-B','5','']]);
 assert.deepEqual(s,evidence);assert.deepEqual(vault,before);
 assert.equal(draft.customerId,'');assert.equal(draft.customerDraft,null);
});
test('correction selection uses explicit image reference, not upload order',()=>{
 const s=sources().reverse();const draft=quoteSourceWorkingDraft(s,runtime(emptyVault()),message);
 assert.equal(draft.items[0].quantity,'10');
});
test('reordered correction rows are matched by SKU and original row order survives',()=>{
 const s=change(sources(),1,d=>d.items.reverse());
 assert.deepEqual(quoteSourceWorkingDraft(s,runtime(emptyVault()),message).items.map(x=>[x.descriptionEn,x.quantity]),[['QA-A','10'],['QA-B','5']]);
});
test('quantity correction never silently changes price, unit, packing, currency or customer',()=>{
 for(const fn of [d=>d.items[0].unitPrice='2',d=>d.items[0].unit='CTN',d=>d.items[0].packing='6 x 3kg',d=>d.currency='EUR',d=>d.customerName='Another Buyer']){
  assert.throws(()=>quoteSourceWorkingDraft(change(sources(),1,fn),runtime(emptyVault()),message),/SOURCE_INCOMPLETE/);
 }
});
test('Controller stages the correction locally, and explains unsafe overlays in the chosen language',async()=>{
 const vault=emptyVault(),before=structuredClone(vault);
 const context={conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'},conversationSources:sources()};
 const result=await orchestrateAiToolRequest({message,vault,context,language:'ar'});
 assert.equal(result.workingDraft.items.length,2);assert.equal(result.proposal,null);assert.equal(result.plannedBy,'local');
 context.conversationSources=change(sources(),1,d=>d.items.pop());
 const blocked=await orchestrateAiToolRequest({message,vault,context,language:'ar'});
 assert.equal(blocked.workingDraft,undefined);assert.equal(blocked.proposal,null);assert.equal(blocked.plan.calls.length,0);
 assert.match(blocked.answer,/رموز الأصناف/);assert.doesNotMatch(blocked.answer,/SOURCE_INCOMPLETE|CORRECTION_REVIEW|No records/);
 assert.deepEqual(vault,before);
 const clarify=await orchestrateAiToolRequest({message:'جهز عرض سعر من المرفقين',vault,context:{...context,conversationSources:sources()},language:'ar'});
 assert.match(clarify.answer,/تصحيح على الأصل/);assert.doesNotMatch(clarify.answer,/SOURCE_INCOMPLETE|No records/);
 assert.equal(clarify.workingDraft,undefined);assert.deepEqual(vault,before);
});
test('partial, missing, duplicate or unknown SKU corrections fail closed',()=>{
 for(const fn of [d=>d.items.pop(),d=>delete d.items[0].sku,d=>d.items[1].sku='QA-A',d=>d.items[0].sku='OTHER',d=>d.items[0].quantity='invalid']){
  assert.throws(()=>quoteSourceWorkingDraft(change(sources(),1,fn),runtime(emptyVault()),message),/SOURCE_INCOMPLETE/);
 }
});
test('ordinary combine, negation, uncertain extraction and multiple correction images retain protections',()=>{
 const s=sources();
 assert.throws(()=>quoteSourceWorkingDraft(s,runtime(emptyVault()),'جهز عرض سعر من المرفقين'),/explicit request/);
 assert.throws(()=>quoteSourceWorkingDraft(s,runtime(emptyVault()),message.replace('اعتمد','لا تعتمد')),/explicit request/);
 assert.throws(()=>quoteSourceWorkingDraft([{...s[0],confidence:.2},s[1]],runtime(emptyVault()),message),/SOURCE_INCOMPLETE/);
 assert.throws(()=>quoteSourceWorkingDraft([...s,{...s[1],fileName:'second.png'}],runtime(emptyVault()),message),/SOURCE_INCOMPLETE/);
 assert.equal(quoteSourceWorkingDraft(s,createAiToolRuntime(emptyVault(),{conversationMode:'advisor',assistantRuntime:{scope:'business'}}),message),null);
});
