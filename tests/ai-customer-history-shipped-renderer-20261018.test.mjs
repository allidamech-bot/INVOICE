import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {
  formatAiCustomerHistoryEvidence,
  formatAiCustomerSummaryEvidence
} from '../dist/src/lib/ai-tool-presentation.js';

const history={customerId:'private-technical-id',statements:[{
 currency:'USD',billed:'300.00',paid:'50.00',outstanding:'250.00',
 entries:[
  {date:'2026-10-18',type:'invoice',reference:'QA-ACCEPT-INV-20261018',
   debit:'200.00',credit:'0.00',balance:'200.00',relatedInvoiceNumber:'QA-ACCEPT-INV-20261018'},
  {date:'2026-10-18',type:'invoice',reference:'QA-ACCEPT-VOID-20261018',
   debit:'100.00',credit:'0.00',balance:'300.00',relatedInvoiceNumber:'QA-ACCEPT-VOID-20261018'},
  {date:'2026-10-18',type:'payment',reference:'QA-ACCEPT-PAY-20261018',
   debit:'0.00',credit:'50.00',balance:'250.00',relatedInvoiceNumber:'QA-ACCEPT-INV-20261018'}
 ]
}]};
const summary={
 id:'private-technical-id',name:'LOUREX QA TEST',preferredCurrency:'USD',
 receivables:[{currency:'USD',billed:'300.00',paid:'50.00',outstanding:'250.00'}],
 recentDocuments:[{kind:'invoice',number:'QA-ACCEPT-INV-20261018',date:'2026-10-18',
  total:'200.00',currency:'USD'}]
};
function shipped(){
 const built=readFileSync('dist/src/components/AiCopilot.js','utf8');
 const start=built.indexOf('function __lourexNaturalizeToolAnswer(');
 const end=built.indexOf('function __lourexToolActivityCard(',start);
 assert.ok(start>=0&&end>start,'shipped answer owner is missing');
 const env=vm.createContext({
  formatAiCustomerHistoryEvidence,formatAiCustomerSummaryEvidence,
  __lourexToolTitle:(tool,ar)=>tool==='customer.getHistory'?(ar?'سجل العميل':'Customer history'):(ar?'ملخص العميل':'Customer summary'),
  formatAiDocumentEvidence:()=>{throw Error('Wrong formatter')},
  __lourexCompactObject:()=>{throw Error('Customer evidence fell into lossy nested-object formatter')}
 });
 vm.runInContext(built.slice(start,end),env);
 return env.__lourexNaturalizeToolAnswer;
}
test('compiled production chat reply presents posted customer payment, not Entries: ...',()=>{
 const render=shipped();
 const result={answer:'Previously collapsed Entries: ...',proposal:null,results:[
  {id:'1',tool:'customer.getSummary',ok:true,class:'read',data:summary},
  {id:'2',tool:'customer.getHistory',ok:true,class:'read',data:history}
 ]};
 const before=structuredClone(result);
 for(const lang of ['ar','en']){
  const answer=render(result,lang);
  assert.match(answer,/LOUREX QA TEST/);
  assert.match(answer,/QA-ACCEPT-PAY-20261018/);
  assert.match(answer,/50\.00 USD/);
  assert.match(answer,/250\.00 USD/);
  assert.match(answer,/QA-ACCEPT-INV-20261018/);
  assert.match(answer,/2026-10-18/);
  assert.doesNotMatch(answer,/Entries:\s*\.{3}|Customer Id:|Statements:\s*1|private-technical-id|\"entries\"/i);
  assert.match(answer,lang==='ar'?/تحصيل[\s\S]*المبلغ الدائن: 50\.00 USD/:/Payment[\s\S]*Credit amount: 50\.00 USD/);
  assert.ok(answer.indexOf('QA-ACCEPT-PAY-20261018')<answer.indexOf('العمليات المالية عالية التأثير')||!answer.includes('العمليات المالية عالية التأثير'));
 }
 assert.deepEqual(result,before,'chat reply must never mutate receipts or business records');
});
test('compiled response retains unrelated read tools via the original safe formatter',()=>{
 const built=readFileSync('dist/src/components/AiCopilot.js','utf8');
 assert.match(built,/customer\.getHistory'\?formatAiCustomerHistoryEvidence/);
 assert.match(built,/customer\.getSummary'\?formatAiCustomerSummaryEvidence/);
 assert.match(built,/document\.get'\?formatAiDocumentEvidence/);
});
test('customer history renderer retains empty and truncated evidence warnings',()=>{
 assert.match(formatAiCustomerHistoryEvidence({statements:[]},'ar'),/لا توجد حركات/);
 assert.doesNotMatch(formatAiCustomerHistoryEvidence({truncated:true,preview:'QA-PRIVATE'},'en'),/QA-PRIVATE/);
 const more=structuredClone(history);
 more.statements[0].entries=Array.from({length:25},(_,n)=>({
  date:'2026-10-18',reference:'PAY-'+n+'-'+('A'.repeat(45)),
  type:'payment',credit:'1.00',balance:'250.00',relatedInvoiceNumber:'INV-QA'
 }));
 const answer=formatAiCustomerHistoryEvidence(more,'en');
 assert.ok(answer.length<4400);
 assert.match(answer,/Partial display/);
});
