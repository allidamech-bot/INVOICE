import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatAiBusinessRecordReply} from '../dist/src/lib/ai-tool-presentation.js';

function fixture(){
 const doc={id:'private-doc-id',number:'INV-2026-0003',kind:'invoice',status:'final',
  issueDate:'2026-10-16',currency:'USD',customerName:'QA Invoice Buyer',
  itemCount:24,itemsTruncated:true,items:Array.from({length:20},(_,i)=>({
   id:'hidden-item-'+i,descriptionEn:'QA Product '+(i+1),
   descriptionAr:'صنف اختبار '+(i+1),quantity:'10',unit:'PCS',unitPrice:'1.03'})),
  totals:{subtotal:'3090.00',tax:'309.00',grandTotal:'3399.00'}};
 const customer={id:'secret-customer-id',name:'QA Invoice Buyer',
  receivables:[{currency:'USD',billed:'3399.00',paid:'399.00',outstanding:'3000.00'}]};
 const history={customerId:'secret-customer-id',statements:[{currency:'USD',
  billed:'3399.00',paid:'399.00',outstanding:'3000.00',entries:[
   {type:'invoice',date:'2026-10-16',reference:'INV-2026-0003',
    debit:'3399.00',credit:'0.00',balance:'3399.00'},
   {type:'payment',date:'2026-10-16',reference:'QA752-PAY-01 TEST ONLY',
    debit:'0.00',credit:'399.00',balance:'3000.00',relatedInvoiceNumber:'INV-2026-0003'}
  ]}]};
 return{answer:'Legacy wall of text',plan:{version:1,calls:[]},
  results:[
   {tool:'document.get',ok:true,class:'read',data:doc},
   {tool:'customer.getSummary',ok:true,class:'read',data:customer},
   {tool:'customer.getHistory',ok:true,class:'read',data:history}
  ]};
}
test('financial readout prioritizes invoice totals, payments and customer balance over optional twenty product lines',()=>{
 const result=fixture(),original=structuredClone(result);
 for(const language of ['ar','en']){
  const output=formatAiBusinessRecordReply(result,language);
  assert.ok(output);
  assert.match(output,/INV-2026-0003/);
  assert.match(output,/QA Invoice Buyer/);
  assert.match(output,/3090\.00/);
  assert.match(output,/309\.00/);
  assert.match(output,/3399\.00/);
  assert.match(output,/399\.00/);
  assert.match(output,/3000\.00/);
  assert.match(output,/QA752-PAY-01 TEST ONLY/);
  assert.match(output,/2026-10-16/);
  assert.match(output,/:::lourex-details/);
  assert.match(output,/:::lourex-end/);
  assert.ok(output.indexOf('QA752-PAY-01 TEST ONLY')<output.indexOf(':::lourex-details'));
  assert.doesNotMatch(output,/private-doc-id|secret-customer-id|Entries:\s*\.{3}/);
  assert.match(output,language==='ar'?/حركات الحساب المسجلة/:/Recorded account movements/);
  assert.match(output,language==='ar'?/القائمة جزئية/:/Partial list/);
  assert.ok(output.length<=4750);
 }
 assert.deepEqual(result,original,'display must never mutate business records');
});
test('read-only customer statements render independently and keep currencies separate',()=>{
 const data=fixture(),result={results:data.results.slice(1)};
 result.results[1].data.statements.push({currency:'EUR',entries:[
  {type:'payment',date:'2026-10-18',reference:'EUR-RECEIPT',credit:'20.00',balance:'40.00'}]});
 const output=formatAiBusinessRecordReply(result,'en');
 assert.match(output,/EUR-RECEIPT/);
 assert.match(output,/20\.00/);
 assert.match(output,/QA752-PAY-01 TEST ONLY/);
 assert.match(output,/399\.00/);
 assert.doesNotMatch(output,/:::lourex-details/);
});
test('an unrelated tool or an absent result does not replace original specialized renderer',()=>{
 assert.equal(formatAiBusinessRecordReply({results:[{tool:'product.getSummary',ok:true,data:{sku:'X'}}]},'en'),null);
 assert.equal(formatAiBusinessRecordReply({results:[]},'ar'),null);
});
test('an incomplete document never claims missing total and failed reads stay visible',()=>{
 const result=fixture();result.results[0].data={truncated:true,number:'INV-2026-0003'};
 result.results[2]={tool:'customer.getHistory',ok:false,summary:'Customer ledger unavailable',data:null};
 const output=formatAiBusinessRecordReply(result,'en');
 assert.match(output,/incomplete|Incomplete/i);
 assert.match(output,/Customer ledger unavailable/);
 assert.doesNotMatch(output,/:::lourex-details/);
});
test('large item listing cannot leak raw collapsible markup when trimmed',()=>{
 const result=fixture();
 result.results[0].data.items=result.results[0].data.items.map((item,i)=>({...item,descriptionEn:'Very long catalog identity '+('A'.repeat(160))+' '+i}));
 const output=formatAiBusinessRecordReply(result,'en');
 assert.ok(output.length<=4750);
 assert.equal(output.includes(':::lourex-details'),output.includes(':::lourex-end'));
});
test('production bundle calls the concise financial formatter before falling back, and has accessible details renderer',()=>{
 const bundle=readFileSync('dist/src/components/AiCopilot.js','utf8');
 const call=bundle.indexOf('formatAiBusinessRecordReply(result,language)');
 const fallback=bundle.indexOf("if(!result?.results?.length)return String(result?.answer||'')");
 assert.ok(call>=0&&fallback>=0&&call<fallback);
 const workspace=readFileSync('dist/src/components/AiConversationWorkspace.js','utf8');
 assert.match(workspace,/lxw-ai-record-details/);
 assert.match(workspace,/:::lourex-end/);
 assert.match(workspace,/summary/);
});
