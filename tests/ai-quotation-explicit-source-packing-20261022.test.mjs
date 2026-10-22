import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createAiToolRuntime} from '../dist/src/lib/ai-tool-orchestrator.js';
import {exactSpreadsheetQuote} from '../dist/src/lib/ai-spreadsheet-quote.js';
import {quoteSourceWorkingDraft} from '../dist/src/lib/ai-quote-source-draft.js';

const request='حوّل هذا الملف إلى عرض سعر';
function fixture(){
 const vault=emptyVault();
 const runtime=createAiToolRuntime(vault,{conversationMode:'controller',
   assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
 return {vault,runtime};
}
function source(evidence,name='packing-qa.xlsx'){
 return{fileName:name,route:'quote_request',documentType:'quote_request',confidence:.96,
   extracted:JSON.stringify(evidence),quoteSheetCandidate:JSON.stringify(evidence)};
}
function exactSourceRow(extra={}){
 return{sku:'QA1',descriptionEn:'Strawberry dragee',descriptionAr:'',quantity:'12',unit:'CTN',packing:'6 bags × 3 kg per carton',
   unitPrice:'50',unitCost:'',unitCostColumnPresent:false,quantityConfidence:1,quantityAmbiguous:false,
   productConfidence:1,...extra};
}
function evidence(items){
 return{parser:'exact-spreadsheet-columns',sourceRowCount:items.length,currency:'SAR',customerName:'',
   customerEmail:'',customerPhone:'',items};
}

test('explicit spreadsheet packing cells pass through to an unsaved customer quotation without quantity or price change',()=>{
 const sheet={name:'RFQ',matrix:[
   ['Description','Qty','Unit','Packing','Price','Currency'],
   ['Strawberry dragee','12','CTN','6 bags × 3 kg per carton','50','SAR'],
   ['Mango dragee','3','CTN','outer box inside carton — 24 pcs','60','SAR']
 ]};
 const parsed=exactSpreadsheetQuote([sheet]);
 assert.ok(parsed);
 assert.equal(parsed.sourceRowCount,2);
 assert.equal(parsed.items[0].packing,'6 bags × 3 kg per carton');
 assert.equal(parsed.items[1].packing,'outer box inside carton — 24 pcs');
 const {vault,runtime}=fixture(),before=structuredClone(vault);
 const draft=quoteSourceWorkingDraft([source(parsed)],runtime,request);
 assert.deepEqual(draft.items.map(row=>row.packing),['6 bags × 3 kg per carton','outer box inside carton — 24 pcs']);
 assert.deepEqual(draft.items.map(row=>row.quantity),['12','3']);
 assert.deepEqual(draft.items.map(row=>row.unitPrice),['50','60']);
 assert.deepEqual(draft.items.map(row=>row.unit),['CTN','CTN']);
 assert.deepEqual(vault,before);
 assert.equal(draft.foundationApproval,undefined);
});

test('Arabic packing header is supported, and a missing pack column never manufactures a package',()=>{
 const arabic=exactSpreadsheetQuote([{name:'Arabic',matrix:[
  ['اسم الصنف','الكمية','الوحدة','وصف التعبئة','سعر الوحدة'],
  ['دراجية فراولة','6','كرتون','كرتون ٦ علب × ٣ كيلو','90']
 ]}]);
 assert.equal(arabic.items[0].packing,'كرتون ٦ علب × ٣ كيلو');
 const without=exactSpreadsheetQuote([{name:'No packing column',matrix:[
  ['Item','Quantity','Unit','Price'],['Strawberry','5','PCS','10']
 ]}]);
 assert.equal(without.items[0].packing,'');
 const {runtime}=fixture();
 const draft=quoteSourceWorkingDraft([source(without)],runtime,request);
 assert.equal('packing' in draft.items[0],false);
});

test('malformed or oversize packaging fails the complete quote instead of dropping only its packaging field',()=>{
 const {runtime}=fixture(),valid=evidence([exactSourceRow()]);
 for(const value of ['X'.repeat(121),'\u0001injected',12,{other:'supplier instruction'}]){
   const raw=evidence([exactSourceRow({packing:value})]);
   assert.throws(()=>quoteSourceWorkingDraft([source(raw)],runtime,request),/Packing is invalid/);
 }
 const sheet={name:'Oversize',matrix:[['Item','Qty','Packing'],['Strawberry','1','X'.repeat(121)]]};
 assert.throws(()=>exactSpreadsheetQuote([sheet]),/Packing description is invalid or oversized/);
 assert.equal(quoteSourceWorkingDraft([source(valid)],runtime,'حلل فقط'),null);
});

test('multi-file quotation combines complete explicitly supplied packages in order, without leaking source costs as sell prices',()=>{
 const {runtime,vault}=fixture(),before=structuredClone(vault);
 const first=evidence([exactSourceRow({packing:'6 × 2.5 kg',unitPrice:''})]);
 const second=evidence([exactSourceRow({sku:'QA2',descriptionEn:'Almonds',packing:'Inner box: 3 kg',unitPrice:''})]);
 const sources=[source(first,'file-a.xlsx'),source(second,'file-b.xlsx')];
 const draft=quoteSourceWorkingDraft(sources,runtime,'ادمج الملفين في عرض سعر واحد');
 assert.deepEqual(draft.items.map(x=>x.packing),['6 × 2.5 kg','Inner box: 3 kg']);
 assert.deepEqual(draft.items.map(x=>x.unitPrice),['','']);
 assert.equal(draft.items.length,2);
 assert.deepEqual(vault,before);
 const mismatch=evidence([exactSourceRow({packing:'Something',unitPrice:'12'})]);
 mismatch.currency='USD';
 assert.throws(()=>quoteSourceWorkingDraft([sources[0],source(mismatch,'foreign.xlsx')],runtime,
   'ادمج الملفين في عرض سعر واحد'),/different currency/);
});

test('quote extraction schema accepts only explicit bounded packing and marks it as review-only',()=>{
 const backend=readFileSync(new URL('../api/quote-source-ai.js',import.meta.url),'utf8');
 const front=readFileSync(new URL('../src/lib/ai-quote-source-draft.ts',import.meta.url),'utf8');
 assert.match(backend,/packing:\{type:'STRING'\}/);
 assert.match(backend,/packing is an optional literal description/);
 assert.match(backend,/row\.packing\.length>120/);
 assert.match(backend,/Never derive packing from order quantity/);
 assert.match(front,/const rawPacking=row\.packing/);
 assert.match(front,/No rows omitted/);
 assert.doesNotMatch(front,/convertNestedPack\(/,'quoted packing does not change the selling quantity');
});
