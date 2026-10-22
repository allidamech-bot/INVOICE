import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime} from '../dist/src/lib/ai-tool-orchestrator.js';
import {quoteSourceWorkingDraft} from '../dist/src/lib/ai-quote-source-draft.js';

const request='ادمج الملفين في عرض سعر موحد';
function fixture(){
 const vault=emptyVault();
 const runtime=createAiToolRuntime(vault,{conversationMode:'controller',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
 return{vault,runtime};
}
function evidence(sku='QA1',price='12'){
 return{currency:'SAR',items:[{sku,descriptionEn:'Synthetic item '+sku,quantity:'3',unit:'CTN',unitPrice:price,quantityConfidence:1,quantityAmbiguous:false,productConfidence:1}]};
}
function file(name,extracted,extras={}){
 return{fileName:name,route:'quote_request',documentType:'customer_rfq',confidence:.97,extracted,...extras};
}

test('two renamed copies of the same verified RFQ are rejected before any working draft',()=>{
 const {vault,runtime}=fixture(),before=structuredClone(vault);
 const raw=JSON.stringify(evidence()),files=[file('quote-original.xlsx',raw),file('quote-renamed.pdf',raw)];
 assert.throws(()=>quoteSourceWorkingDraft(files,runtime,request),/SOURCE_INCOMPLETE: Duplicate quotation content/);
 assert.deepEqual(vault,before);
 assert.equal(vault.documents.length,0);
});

test('JSON whitespace or property ordering cannot bypass multi-file quote duplicate detection',()=>{
 const {runtime}=fixture(),source=evidence();
 const formatted=JSON.stringify(source,null,2);
 const reordered=JSON.stringify({items:source.items.map(item=>({
   productConfidence:item.productConfidence,quantityAmbiguous:item.quantityAmbiguous,unitPrice:item.unitPrice,
   unit:item.unit,sku:item.sku,descriptionEn:item.descriptionEn,quantityConfidence:item.quantityConfidence,quantity:item.quantity
 })),currency:source.currency});
 const files=[file('A.xlsx',formatted),file('B.xlsx',reordered)];
 assert.throws(()=>quoteSourceWorkingDraft(files,runtime,request),/Duplicate quotation content/);
});

test('exact-sheet candidates are matched by their authoritative evidence, regardless of original filenames',()=>{
 const {runtime}=fixture(),raw=JSON.stringify(evidence('Q10'));
 const files=[
  file('sheet-a.csv',JSON.stringify({summary:'different model summary'}),{quoteSheetCandidate:raw}),
  file('sheet-copy.csv',JSON.stringify({summary:'a different model classification'}),{quoteSheetCandidate:raw})
 ];
 assert.throws(()=>quoteSourceWorkingDraft(files,runtime,request),/Duplicate quotation content/);
});

test('distinct complete source files still merge in upload order with exact line fields and zero writes',()=>{
 const {vault,runtime}=fixture(),before=structuredClone(vault);
 const files=[file('same-name.xlsx',JSON.stringify(evidence('SKU-A','50'))),
   file('same-name.xlsx',JSON.stringify(evidence('SKU-B','12')))];
 const draft=quoteSourceWorkingDraft(files,runtime,request);
 assert.equal(draft.capability,'document.createDraft');
 assert.deepEqual(draft.items.map(row=>row.descriptionEn),['Synthetic item SKU-A','Synthetic item SKU-B']);
 assert.deepEqual(draft.items.map(row=>row.unitPrice),['50','12']);
 assert.deepEqual(draft.items.map(row=>row.quantity),['3','3']);
 assert.equal(draft.foundationApproval,undefined);
 assert.deepEqual(vault,before);
});

test('row order is not silently disregarded, and multiple sources still require explicit combination',()=>{
 const {runtime}=fixture(),one=evidence('QA1'),second=evidence('QA2');
 const rows=[...one.items,...second.items],a={...one,items:rows},b={...one,items:[...rows].reverse()};
 const files=[file('a.xlsx',JSON.stringify(a)),file('b.xlsx',JSON.stringify(b))];
 assert.equal(quoteSourceWorkingDraft(files,runtime,request).items.length,4,
   'distinct ordered source evidence is never silently filtered out');
 assert.throws(()=>quoteSourceWorkingDraft(files,runtime,'أنشئ عرض سعر'),/explicit request for one combined quotation/);
});

test('read-only Advisor and non-business scope still cannot draft a quotation',()=>{
 const {vault}=fixture(),raw=JSON.stringify(evidence());
 const sources=[file('a.xlsx',raw),file('b.xlsx',JSON.stringify(evidence('QA2')))];
 for(const opts of [
  {conversationMode:'advisor',assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}},
  {conversationMode:'controller',assistantRuntime:{scope:'personal',workspaceId:'',branchId:''}}
 ]){
  const runtime=createAiToolRuntime(vault,opts);
  assert.equal(quoteSourceWorkingDraft(sources,runtime,request),null);
 }
});
