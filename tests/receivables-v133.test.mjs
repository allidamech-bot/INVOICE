import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { defaultCompany } from '../dist/src/lib/defaults.js';
import { invoicePaymentSummary, normalizePaymentRecord } from '../dist/src/lib/payments.js';
import { customerStatement, daysOverdue, agingBucketFor, receivablesByCurrency } from '../dist/src/lib/receivables.js';

const read=path=>readFile(path,'utf8');

function makeInvoice({id='inv-1',number='INV-2026-0001',currency='USD',amount='1000.00',dueDate='2026-08-01',customerId='cust-1',customerName='Acme',issueDate='2026-07-20'}={}){
  const doc=createBlankDocument('invoice',number,defaultCompany());
  doc.id=id;doc.status='final';doc.lifecycleStatus='active';doc.role='standard';doc.currency=currency;doc.issueDate=issueDate;doc.dueDate=dueDate;
  doc.customerSnapshot={sourceCustomerId:customerId,companyNameEn:customerName,companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  doc.items=[{...doc.items[0],quantity:'1',unitPrice:amount,descriptionEn:'Service'}];
  doc.adjustments={discountEnabled:false,discountMode:'fixed',discountValue:'0.00',shippingEnabled:false,shipping:'0.00',otherChargesEnabled:false,otherCharges:'0.00',taxEnabled:false,taxPercent:'0'};
  return doc;
}
function makeCredit(invoice,{id='cn-1',number='CN-2026-0001',amount='200.00',issueDate='2026-08-10',voided=false}={}){
  const doc=makeInvoice({id,number,currency:invoice.currency,amount,dueDate:'',customerId:invoice.customerSnapshot.sourceCustomerId,customerName:invoice.customerSnapshot.companyNameEn,issueDate});
  doc.role='credit-note';doc.creditForId=invoice.id;doc.creditForNumber=invoice.number;doc.lifecycleStatus=voided?'voided':'active';
  return doc;
}
function makePayment(invoice,{id='pay-1',amount='300.00',date='2026-08-20',reference='TRX-1'}={}){const now='2026-08-20T12:00:00.000Z';return{id,invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:invoice.customerSnapshot.sourceCustomerId,customerNameEn:invoice.customerSnapshot.companyNameEn,customerNameAr:'',currency:invoice.currency,amount,date,method:'bank-transfer',reference,notes:'',createdAt:now,updatedAt:now};}

test('v133 settlement subtracts active credit notes before payments',()=>{
  const invoice=makeInvoice();const credit=makeCredit(invoice);const payment=makePayment(invoice);
  const summary=invoicePaymentSummary(invoice,[payment],'2026-09-02',[invoice,credit]);
  assert.deepEqual(summary,{status:'overdue',total:'1000.00',credits:'200.00',netTotal:'800.00',paid:'300.00',remaining:'500.00'});
  const voided=makeCredit(invoice,{id:'cn-void',number:'CN-2026-0002',amount:'400.00',voided:true});
  assert.equal(invoicePaymentSummary(invoice,[payment],'2026-09-02',[invoice,credit,voided]).remaining,'500.00');
});

test('v133 payment guard cannot collect more than net invoice after credits',()=>{
  const invoice=makeInvoice();const credit=makeCredit(invoice);const payment=makePayment(invoice);
  const candidate=makePayment(invoice,{id:'pay-2',amount:'500.00',date:'2026-09-02'});
  assert.equal(normalizePaymentRecord(invoice,[payment],candidate,[invoice,credit]).amount,'500.00');
  assert.throws(()=>normalizePaymentRecord(invoice,[payment],{...candidate,amount:'500.01'},[invoice,credit]),/after credit notes/);
});

test('v133 aging boundaries are calendar-day exact',()=>{
  assert.equal(daysOverdue('2026-09-02','2026-09-02'),0);
  assert.equal(daysOverdue('2026-08-03','2026-09-02'),30);
  assert.equal(daysOverdue('2026-08-02','2026-09-02'),31);
  assert.equal(agingBucketFor('2026-08-03','2026-09-02'),'days1to30');
  assert.equal(agingBucketFor('2026-08-02','2026-09-02'),'days31to60');
  assert.equal(agingBucketFor('','2026-09-02'),'current');
});

test('v133 receivables never mix currencies',()=>{
  const usd=makeInvoice();const credit=makeCredit(usd);const payment=makePayment(usd);
  const eur=makeInvoice({id:'inv-eur',number:'INV-2026-0002',currency:'EUR',amount:'120.00',dueDate:'2026-10-01'});
  const rows=receivablesByCurrency([usd,credit,eur],[payment],'2026-09-02');
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(row=>row.currency),['EUR','USD']);
  assert.equal(rows.find(row=>row.currency==='USD').outstanding,'500.00');
  assert.equal(rows.find(row=>row.currency==='USD').aging.days31to60,'500.00');
  assert.equal(rows.find(row=>row.currency==='EUR').outstanding,'120.00');
  assert.equal(rows.find(row=>row.currency==='EUR').aging.current,'120.00');
});

test('v133 customer statement has debit credit and running balance',()=>{
  const invoice=makeInvoice();const credit=makeCredit(invoice);const payment=makePayment(invoice);
  const statement=customerStatement('cust-1',[invoice,credit],[payment],'2026-09-02');
  assert.equal(statement.length,1);assert.equal(statement[0].currency,'USD');
  assert.deepEqual(statement[0].entries.map(entry=>entry.type),['invoice','credit-note','payment']);
  assert.deepEqual(statement[0].entries.map(entry=>entry.balance),['1000.00','800.00','500.00']);
  assert.equal(statement[0].outstanding,'500.00');assert.equal(statement[0].overdue,'500.00');
});

test('v133 UI exposes receivables navigation aging and printable statements offline',async()=>{
  const [app,page,html,sw,panel]=await Promise.all([read('src/app/App.tsx'),read('src/components/ReceivablesPage.tsx'),read('index.html'),read('public/sw.js'),read('src/components/InvoicePaymentsPanel.tsx')]);
  assert.ok(app.includes("screen:'documents'|'customers'|'receivables'|'reports'|'items'|'editor'"));
  assert.ok(app.includes("t('Receivables','المستحقات')"));
  assert.ok(app.includes('<ReceivablesPage'));
  for(const term of ['Receivables Aging','Customer Statement','Print / Save PDF','1–30','31–60','61–90','+90'])assert.ok(page.includes(term),term);
  assert.ok(page.includes('printing-customer-statement'));
  assert.ok(panel.includes('Credit Notes'));assert.ok(panel.includes('Net invoice'));
  assert.ok(html.includes('receivables-v133.css'));
  for(const asset of ['receivables-v133.css','ReceivablesPage.js','receivables.js'])assert.ok(sw.includes(asset),asset);
  const activeCacheVersion=Number(sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';/m)?.[1]??0);
  assert.ok(activeCacheVersion>=133,'receivables requires PWA cache v133 or later');
});
