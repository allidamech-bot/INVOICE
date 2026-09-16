import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultCompany } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { accountedInvoiceCreditNotes, accountedInvoicePayments, invoicePaymentSummary, normalizePaymentRecord } from '../dist/src/lib/payments.js';
import { assertDocumentLifecycleInvariant, createCreditNoteDraft } from '../dist/src/lib/document-lifecycle.js';
import { financialReportByCurrency } from '../dist/src/lib/reports.js';

function invoice(){
  const doc=createBlankDocument('invoice','INV-2026-2581',defaultCompany());
  doc.status='final';
  doc.issueDate='2026-05-10';
  doc.dueDate='2026-06-10';
  doc.currency='USD';
  doc.customerSnapshot={sourceCustomerId:'cust-258',companyNameEn:'Chronology Customer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  doc.items[0].descriptionEn='Accounting audit item';
  doc.items[0].quantity='1';
  doc.items[0].unitPrice='1000.00';
  doc.items[0].unitCost='600.00';
  return doc;
}
function payment(doc,{id='pay-258',date='2026-05-10',amount='250.00'}={}){
  const at=`${date}T12:00:00.000Z`;
  return{id,invoiceId:doc.id,invoiceNumber:doc.number,customerId:'cust-258',customerNameEn:'Chronology Customer',customerNameAr:'',currency:'USD',amount,date,method:'bank-transfer',reference:'REF-258',notes:'',createdAt:at,updatedAt:at};
}

test('v258 rejects a new payment dated before the source invoice',()=>{
  const doc=invoice();
  assert.throws(()=>normalizePaymentRecord(doc,[],payment(doc,{date:'2026-05-09'}),[]),/Payment date cannot be before the invoice issue date/);
  const sameDay=normalizePaymentRecord(doc,[],payment(doc,{date:'2026-05-10'}),[]);
  assert.equal(sameDay.date,'2026-05-10');
  assert.equal(sameDay.amount,'250.00');
});

test('v258 excludes legacy pre-issue settlements from balances and reports',()=>{
  const doc=invoice();
  const badPayment=payment(doc,{date:'2026-05-09',amount:'300.00'});
  const badCredit=createCreditNoteDraft(doc,'CN-2026-2581','200.00');
  badCredit.status='final';
  badCredit.issueDate='2026-05-09';
  const documents=[doc,badCredit];
  assert.equal(accountedInvoicePayments(doc,[badPayment]).length,0);
  assert.equal(accountedInvoiceCreditNotes(doc,documents).length,0);
  const summary=invoicePaymentSummary(doc,[badPayment],'2026-05-31',documents);
  assert.equal(summary.paid,'0.00');
  assert.equal(summary.credits,'0.00');
  assert.equal(summary.remaining,'1000.00');
  const report=financialReportByCurrency(documents,[badPayment],'2026-05-01','2026-05-31');
  assert.equal(report.length,1);
  assert.equal(report[0].currency,'USD');
  assert.equal(report[0].invoiced,'1000.00');
  assert.equal(report[0].collected,'0.00');
  assert.equal(report[0].outstanding,'1000.00');
  assert.equal(report[0].creditNotes,0);
});

test('v258 refuses issuance of a credit note that predates its invoice',()=>{
  const doc=invoice();
  const credit=createCreditNoteDraft(doc,'CN-2026-2582','100.00');
  credit.status='final';
  credit.issueDate='2026-05-09';
  assert.throws(()=>assertDocumentLifecycleInvariant(credit,[doc,credit],[]),/Credit note issue date cannot be before the source invoice issue date/);
});

test('v258 keeps legitimate future settlements as-of safe',()=>{
  const doc=invoice();
  const futurePayment=payment(doc,{date:'2026-06-20',amount:'300.00'});
  const futureCredit=createCreditNoteDraft(doc,'CN-2026-2583','200.00');
  futureCredit.status='final';
  futureCredit.issueDate='2026-06-15';
  const documents=[doc,futureCredit];
  assert.doesNotThrow(()=>assertDocumentLifecycleInvariant(futureCredit,documents,[]));
  assert.equal(invoicePaymentSummary(doc,[futurePayment],'2026-05-31',documents).remaining,'1000.00');
  const june=invoicePaymentSummary(doc,[futurePayment],'2026-06-30',documents);
  assert.equal(june.credits,'200.00');
  assert.equal(june.paid,'300.00');
  assert.equal(june.remaining,'500.00');
});

test('v258 payment UI constrains the picker to invoice issue date without banning future dates',async()=>{
  const source=await readFile('src/components/InvoicePaymentsPanel.tsx','utf8');
  assert.match(source,/const date=this\.props\.document\.issueDate>today\?this\.props\.document\.issueDate:today/);
  assert.match(source,/type="date" min=\{doc\.issueDate\}/);
  assert.doesNotMatch(source,/max=\{todayIso\(\)\}/);
});
