import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { invoicePaymentSummary, normalizePaymentRecord } from '../dist/src/lib/payments.js';
import { customerStatement } from '../dist/src/lib/receivables.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';

function finalInvoice(base,{id='inv-fin',number='INV-2026-0900',amount='100.00'}={}){
  const invoice=createBlankDocument('invoice',number,base.company);
  invoice.id=id;invoice.status='final';invoice.lifecycleStatus='active';invoice.role='standard';
  invoice.customerSnapshot={sourceCustomerId:'cust-fin',companyNameEn:'Financial Buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  invoice.items=[{...invoice.items[0],descriptionEn:'Service',quantity:'1',unitPrice:amount}];
  return invoice;
}
function payment(invoice,{id='pay-fin',amount='40.00',date='2026-09-05',currency=invoice.currency,customerId='cust-fin'}={}){
  const now='2026-09-05T12:00:00.000Z';
  return{id,invoiceId:invoice.id,invoiceNumber:invoice.number,customerId,customerNameEn:'Financial Buyer',customerNameAr:'',currency,amount,date,method:'bank-transfer',reference:id,notes:'',createdAt:now,updatedAt:now};
}

test('financial merge cannot leave a payment linked to a deleted source invoice',()=>{
  const base=emptyVault();const invoice=finalInvoice(base);const receipt=payment(invoice);
  base.documents=[invoice];base.payments=[receipt];
  const intent={...base,documents:[]};
  assert.throws(()=>mergeVaultIntent(base,intent,base),/missing source invoice/i);
});

test('deleting one payment preserves an unrelated payment added concurrently',()=>{
  const base=emptyVault();const invoice=finalInvoice(base);const first=payment(invoice,{id:'pay-first',amount:'40.00'});
  base.documents=[invoice];base.payments=[first];
  const second=payment(invoice,{id:'pay-second',amount:'20.00'});
  const latest=mergeVaultIntent(base,{...base,payments:[first,second]},base);
  const merged=mergeVaultIntent(base,{...base,payments:[]},latest);
  assert.deepEqual(merged.payments.map(item=>item.id),['pay-second']);
});

test('malformed legacy payments stay out of balances and statements but block new settlement writes',()=>{
  const base=emptyVault();const invoice=finalInvoice(base);
  const negative=payment(invoice,{id:'pay-negative',amount:'-25.00'});
  const invalidDate=payment(invoice,{id:'pay-date',amount:'20.00',date:'not-a-date'});
  const wrongCurrency=payment(invoice,{id:'pay-eur',amount:'30.00',currency:'EUR'});
  const wrongCustomer=payment(invoice,{id:'pay-other',amount:'10.00',customerId:'other-customer'});
  const malformed=[negative,invalidDate,wrongCurrency,wrongCustomer];
  const summary=invoicePaymentSummary(invoice,malformed,'2026-09-05',[invoice]);
  assert.equal(summary.paid,'0.00');
  assert.equal(summary.remaining,'100.00');
  const statement=customerStatement('cust-fin',[invoice],malformed,'2026-09-05');
  assert.deepEqual(statement[0].entries.map(entry=>entry.type),['invoice']);
  const candidate=payment(invoice,{id:'pay-new',amount:'10.00'});
  assert.throws(()=>normalizePaymentRecord(invoice,[negative],candidate,[invoice]),/invalid amount/i);
  assert.throws(()=>normalizePaymentRecord(invoice,[invalidDate],candidate,[invoice]),/invalid date/i);
  assert.throws(()=>normalizePaymentRecord(invoice,[wrongCurrency],candidate,[invoice]),/currency cannot change/i);
  assert.throws(()=>normalizePaymentRecord(invoice,[wrongCustomer],candidate,[invoice]),/customer cannot change/i);
});
