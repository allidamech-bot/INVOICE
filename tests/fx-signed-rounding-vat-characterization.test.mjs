import test from 'node:test';
import assert from 'node:assert/strict';
import {convertWithFxRate,convertWithFxMatch} from '../dist/src/lib/fx-rates.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createCreditNoteDraft,invoiceCreditCapacity,assertDocumentLifecycleInvariant} from '../dist/src/lib/document-lifecycle.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {outputVatReport} from '../dist/src/lib/tax-vat.js';

const rate=value=>({id:'qa-fx',workspaceId:'default',date:'2026-10-01',
  fromCurrency:'USD',toCurrency:'EUR',rate:value,sourceLabel:'Synthetic QA',
  notes:'',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'});

for(const [amount,value,expected] of [
  ['1.0000','1.23456000','1.2346'],['-1.0000','1.23456000','-1.2346'],
  ['1','1.23455000','1.2346'],['-1','1.23455000','-1.2346'],
  ['-1','1.23454000','-1.2345'],['-1','1.00000000','-1.00'],
  ['0','1.23456000','0.00']
])test('direct FX '+amount+' at '+value+' rounds to '+expected,()=>{
  const saved=rate(value),before=JSON.stringify(saved);
  assert.equal(convertWithFxRate(amount,saved),expected);
  assert.equal(convertWithFxMatch(amount,{rate:saved,inverse:false}),expected);
  assert.equal(JSON.stringify(saved),before);
});
for(const [amount,value,expected] of [
  ['1','3','0.3333'],['-1','3','-0.3333'],
  ['2','3','0.6667'],['-2','3','-0.6667'],
  ['1','32','0.0313'],['-1','32','-0.0313'],
  ['-375','3.75','-100.00'],['0','3','0.00']
])test('inverse FX '+amount+' at '+value+' rounds to '+expected,()=>{
  const saved=rate(value),before=JSON.stringify(saved);
  assert.equal(convertWithFxMatch(amount,{rate:saved,inverse:true}),expected);
  assert.equal(JSON.stringify(saved),before);
});

test('VAT-01 characterization: partial credit draft settles receivable without reducing output VAT when issued tax disabled',()=>{
  const vault=emptyVault(),day='2026-10-01';
  const invoice=createBlankDocument('invoice','INV-QA-VAT-01',vault.company);
  Object.assign(invoice,{id:'qa-vat-invoice',status:'final',issueDate:day,dueDate:day,
    workspaceId:'default',branchId:'main',currency:'USD',
    customerSnapshot:{sourceCustomerId:'qa-vat-customer',companyNameEn:'Synthetic VAT customer',
      companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',
      phone:'',email:'',vatTaxNumber:'',commercialRegistration:''}});
  invoice.items=[{...invoice.items[0],id:'qa-vat-line',descriptionEn:'Synthetic service',
    quantity:'1',unitPrice:'100.00',stockTreatment:'untracked'}];
  invoice.adjustments={...invoice.adjustments,discountEnabled:false,shippingEnabled:false,
    otherChargesEnabled:false,taxEnabled:true,taxPercent:'20'};
  const payment=normalizePaymentRecord(invoice,[],{id:'qa-vat-payment',amount:'60.00',
    date:day,method:'bank-transfer',reference:'QA ONLY',notes:'Synthetic'},[invoice]);
  const payments=[payment],documents=[invoice];
  assert.equal(invoicePaymentSummary(invoice,payments,day,documents).remaining,'60.00');
  assert.equal(invoiceCreditCapacity(invoice,documents,payments).available,'60.00');
  const draft={...createCreditNoteDraft(invoice,'CN-QA-VAT-01','60.00'),issueDate:day};
  assert.equal(draft.adjustments.taxEnabled,false);
  assert.equal(invoicePaymentSummary(invoice,payments,day,[invoice,draft]).remaining,'60.00');
  const issued={...draft,status:'final'};
  assertDocumentLifecycleInvariant(issued,[invoice,issued],payments);
  const summary=invoicePaymentSummary(invoice,payments,day,[invoice,issued]);
  assert.equal(summary.total,'120.00');
  assert.equal(summary.paid,'60.00');
  assert.equal(summary.credits,'60.00');
  assert.equal(summary.remaining,'0.00');
  const report=outputVatReport([invoice,issued],day,'2026-10-31');
  assert.equal(report.rows.length,1);
  assert.equal(report.rows[0].documentId,invoice.id);
  assert.equal(report.currencies[0].outputVat,'20.00');
  assert.equal(report.currencies[0].creditVat,'0.00');
});
