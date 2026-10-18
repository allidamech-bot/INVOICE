import test from 'node:test';
import assert from 'node:assert/strict';
import {formatAiToolAnswer} from '../dist/src/lib/ai-tool-client.js';

const entry=(type,reference,debit,credit,balance,currency='USD',invoice='QA-ACCEPT-INV-20261018')=>({
  currency,date:'2026-10-18',reference,type,description:reference,
  debit,credit,balance,relatedInvoiceNumber:invoice
});
const statement={
  customerId:'qa-customer-id',
  statements:[{currency:'USD',billed:'300.00',credits:'0.00',paid:'50.00',outstanding:'250.00',overdue:'0.00',
    entries:[
      entry('invoice','QA-ACCEPT-INV-20261018','200.00','0.00','200.00'),
      entry('invoice','QA-ACCEPT-INV-SECOND','100.00','0.00','300.00'),
      entry('payment','QA-ACCEPT-PAY-20261018','0.00','50.00','250.00')
    ]}]
};
const answer=(data,language='en',extra=[])=>formatAiToolAnswer(
  {version:1,goal:'Read posted QA customer statement',calls:[]},
  [{id:'customer-history',tool:'customer.getHistory',class:'read',ok:true,
    data,summary:'',source:'lourex-local-engine'},...extra],
  language
);

test('customer payment is a complete dated ledger line in English and Arabic, not an Entries preview',()=>{
  const original=structuredClone(statement);
  for(const lang of ['en','ar']){
    const result=answer(statement,lang);
    assert.match(result,/QA-ACCEPT-PAY-20261018/);
    assert.match(result,/2026-10-18/);
    assert.match(result,/50\.00 USD/);
    assert.match(result,/250\.00 USD/);
    assert.match(result,/QA-ACCEPT-INV-20261018/);
    assert.match(result,/QA-ACCEPT-INV-SECOND/);
    assert.doesNotMatch(result,/Entries\s*:\s*\.{3}|entries\s*:\s*\[/i);
    assert.doesNotMatch(result,/\"reference\"|\"credit\"/);
    assert.match(result,lang==='ar'?/تحصيل.*دائن:\s*50\.00 USD/:/Payment.*Credit:\s*50\.00 USD/);
  }
  assert.deepEqual(statement,original,'formatting cannot modify ledger evidence');
});

test('payments and outstanding balances retain separate currencies without recomputation',()=>{
  const mixed=structuredClone(statement);
  mixed.statements.push({currency:'EUR',billed:'70.00',credits:'0.00',paid:'25.00',outstanding:'45.00',
    entries:[entry('payment','EUR-RECEIPT-1','0.00','25.00','45.00','EUR','EUR-INVOICE')]});
  const result=answer(mixed,'en');
  assert.match(result,/Paid: 50\.00.*Outstanding: 250\.00/);
  assert.match(result,/Paid: 25\.00.*Outstanding: 45\.00/);
  assert.match(result,/EUR-RECEIPT-1/);
  assert.match(result,/25\.00 EUR/);
  assert.match(result,/250\.00 USD/);
  assert.doesNotMatch(result,/250\.00 EUR/);
});

test('named customer history and product evidence render together without hiding the payment',()=>{
  const result=answer(statement,'ar',[{id:'product',tool:'product.getSummary',class:'read',ok:true,
    data:{sku:'QA-ACCEPT-001',quantity:'7',lastUnitPrice:'100',lastCurrency:'USD'},
    summary:'',source:'lourex-local-engine'}]);
  assert.match(result,/QA-ACCEPT-PAY-20261018/);
  assert.match(result,/QA-ACCEPT-001/);
  assert.match(result,/quantity: 7/);
});

test('truncated upstream statements remain explicitly incomplete, never presented as verified payments',()=>{
  const result=answer({truncated:true,preview:'QA-ACCEPT-PAY-20261018 partial JSON'},'en');
  assert.match(result,/tool result is incomplete/);
  assert.doesNotMatch(result,/QA-ACCEPT-PAY-20261018/);
});
