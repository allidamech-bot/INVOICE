import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {defaultCompany} from '../dist/src/lib/defaults.js';
import {accountedInvoicePayments,invoicePayments,invoicePaymentSummary,paidAmount} from '../dist/src/lib/payments.js';
import {customerStatement,receivablesByCurrency} from '../dist/src/lib/receivables.js';
import {financialReportByCurrency,customerPerformanceReport,monthlyPerformanceReport} from '../dist/src/lib/reports.js';
import {treasuryProjection} from '../dist/src/lib/treasury-ledger.js';

function fixture(){
 const invoice=createBlankDocument('invoice','INV-LATE-RECEIPT',defaultCompany());
 invoice.id='late-receipt-invoice';invoice.status='final';invoice.lifecycleStatus='active';
 invoice.role='standard';invoice.issueDate='2026-10-01';invoice.dueDate='2026-10-04';
 invoice.currency='USD';
 invoice.customerSnapshot={sourceCustomerId:'late-receipt-customer',companyNameEn:'Historical Buyer',
  companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',
  email:'',vatTaxNumber:'',commercialRegistration:''};
 invoice.items[0].descriptionEn='Services billed in October';
 invoice.items[0].quantity='1';invoice.items[0].unitPrice='100.00';
 const onTime={id:'on-time-collection',invoiceId:invoice.id,invoiceNumber:invoice.number,
  customerId:'late-receipt-customer',customerNameEn:'Historical Buyer',customerNameAr:'',
  amount:'20.00',currency:'USD',date:'2026-10-02',method:'bank-transfer',
  reference:'PAY-EARLY',notes:'',createdAt:'2026-10-02T10:00:00.000Z',
  updatedAt:'2026-10-02T10:00:00.000Z'};
 const late={...onTime,id:'later-recorded-collection',amount:'30.00',date:'2026-10-03',
  reference:'PAY-RECORDED-LATER',createdAt:'2026-10-20T12:00:00.000Z',
  updatedAt:'2026-10-20T12:00:00.000Z'};
 return{invoice,onTime,late,payments:[onTime,late],documents:[invoice]};
}
const cutoff='2026-10-09',after='2026-10-21';

test('invoice balance as-of October 9 excludes a backdated receipt entered October 20',()=>{
 const {invoice,payments,documents}=fixture();
 assert.deepEqual(accountedInvoicePayments(invoice,payments,cutoff).map(row=>row.id),['on-time-collection']);
 const past=invoicePaymentSummary(invoice,payments,cutoff,documents);
 assert.equal(past.paid,'20.00');
 assert.equal(past.remaining,'80.00');
 assert.equal(invoicePaymentSummary(invoice,payments,after,documents).paid,'50.00');
});

test('customer account and statement retain the original closed-date outstanding balance',()=>{
 const {documents,payments}=fixture();
 const before=receivablesByCurrency(documents,payments,cutoff)[0];
 assert.equal(before.paid,'20.00');
 assert.equal(before.outstanding,'80.00');
 const statement=customerStatement('late-receipt-customer',documents,payments,cutoff)[0];
 assert.deepEqual(statement.entries.map(row=>row.type),['invoice','payment']);
 assert.equal(statement.outstanding,'80.00');
 const later=customerStatement('late-receipt-customer',documents,payments,after)[0];
 assert.equal(later.entries.filter(row=>row.type==='payment').length,2);
 assert.equal(later.outstanding,'50.00');
});

test('monthly and financial reports cannot rewrite past cash from late-entered receipts',()=>{
 const {documents,payments}=fixture();
 const past=financialReportByCurrency(documents,payments,'2026-10-01',cutoff)[0];
 assert.equal(past.collected,'20.00');
 assert.equal(past.outstanding,'80.00');
 assert.equal(past.payments,1);
 const full=financialReportByCurrency(documents,payments,'2026-10-01',after)[0];
 assert.equal(full.collected,'50.00');
 assert.equal(full.outstanding,'50.00');
 assert.equal(full.payments,2);
 assert.equal(monthlyPerformanceReport(documents,payments,'2026-10-01',cutoff)[0].collected,'20.00');
 assert.equal(monthlyPerformanceReport(documents,payments,'2026-10-01',after)[0].collected,'50.00');
});

test('customer performance collected, aging, and treasury as-of stay consistent',()=>{
 const {documents,payments}=fixture();
 const old=customerPerformanceReport([],documents,payments,'2026-10-01',cutoff)[0];
 assert.equal(old.collected,'20.00');
 assert.equal(old.outstanding,'80.00');
 assert.equal(treasuryProjection(payments,[],[],[],[],'USD',cutoff).length,1);
 const latest=customerPerformanceReport([],documents,payments,'2026-10-01',after)[0];
 assert.equal(latest.collected,'50.00');
 assert.equal(latest.outstanding,'50.00');
});

test('direct invoice receipt totals respect as-of creation chronology',()=>{
 const {invoice,payments}=fixture();
 assert.deepEqual(invoicePayments(invoice.id,payments,cutoff).map(row=>row.id),['on-time-collection']);
 assert.equal(paidAmount(invoice.id,payments,cutoff),'20.00');
 assert.equal(paidAmount(invoice.id,payments,after),'50.00');
});

test('legacy receipt with missing recorded-at timestamp remains visible on its economic date',()=>{
 const {invoice,documents,onTime}=fixture();
 const legacy={...onTime,id:'receipt-without-created-timestamp',createdAt:undefined,amount:'15.00'};
 assert.equal(invoicePaymentSummary(invoice,[legacy],cutoff,documents).paid,'15.00');
 assert.equal(financialReportByCurrency(documents,[legacy],'2026-10-01',cutoff)[0].collected,'15.00');
});
