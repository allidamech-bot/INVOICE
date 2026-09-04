import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { defaultCompany } from '../dist/src/lib/defaults.js';
import { customerPerformanceReport, financialReportByCurrency, monthlyPerformanceReport, normalizeReportPeriod } from '../dist/src/lib/reports.js';

const read=path=>readFile(path,'utf8');
const company=defaultCompany();

function customer(id,name){const now='2026-01-01T00:00:00.000Z';return{id,createdAt:now,updatedAt:now,companyNameEn:name,companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',notes:''};}
function invoice({id='inv-usd',number='INV-2026-0001',currency='USD',price='1000.00',cost='600.00',issueDate='2026-01-10',dueDate='2026-01-25',customerId='cust-a',customerName='Alpha',shipping='0.00',shippingCost='0.00',tax='0'}={}){
  const doc=createBlankDocument('invoice',number,company);doc.id=id;doc.status='final';doc.lifecycleStatus='active';doc.role='standard';doc.currency=currency;doc.issueDate=issueDate;doc.dueDate=dueDate;
  doc.customerSnapshot={sourceCustomerId:customerId,companyNameEn:customerName,companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  doc.items=[{...doc.items[0],descriptionEn:'Product',quantity:'1',unitPrice:price,unitCost:cost}];
  doc.adjustments={discountEnabled:false,discountMode:'fixed',discountValue:'0.00',shippingEnabled:shipping!=='0.00',shipping,otherChargesEnabled:false,otherCharges:'0.00',taxEnabled:tax!=='0',taxPercent:tax};
  doc.internalCosts={shippingCost,otherCost:'0.00'};return doc;
}
function credit(source,{id='cn-usd',number='CN-2026-0001',price='200.00',cost='120.00',issueDate='2026-01-20'}={}){const doc=invoice({id,number,currency:source.currency,price,cost,issueDate,dueDate:'',customerId:source.customerSnapshot.sourceCustomerId,customerName:source.customerSnapshot.companyNameEn});doc.role='credit-note';doc.creditForId=source.id;doc.creditForNumber=source.number;return doc;}
function payment(invoice,{id='pay-1',amount='400.00',date='2026-01-15'}={}){const now=`${date}T12:00:00.000Z`;return{id,invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:invoice.customerSnapshot.sourceCustomerId,customerNameEn:invoice.customerSnapshot.companyNameEn,customerNameAr:'',currency:invoice.currency,amount,date,method:'bank-transfer',reference:id,notes:'',createdAt:now,updatedAt:now};}

test('v135 keeps currencies separate and uses period dates without hidden FX conversion',()=>{
  const usd=invoice({shipping:'100.00',shippingCost:'30.00',tax:'10'});const usdCredit=credit(usd);const eur=invoice({id:'inv-eur',number:'INV-2026-0002',currency:'EUR',price:'500.00',cost:'300.00',dueDate:'2026-02-15',customerId:'cust-b',customerName:'Beta'});
  const payments=[payment(usd),payment(usd,{id:'pay-future',amount:'100.00',date:'2026-02-10'}),payment(eur,{id:'pay-eur',amount:'100.00',date:'2026-01-20'})];
  const rows=financialReportByCurrency([usd,usdCredit,eur],payments,'2026-01-01','2026-01-31');
  assert.deepEqual(rows.map(row=>row.currency),['EUR','USD']);
  const usdRow=rows.find(row=>row.currency==='USD');const eurRow=rows.find(row=>row.currency==='EUR');
  assert.equal(usdRow.netSales,'900.00');assert.equal(usdRow.grossProfit,'390.00');assert.equal(usdRow.marginPercent,'43.33');assert.equal(usdRow.collected,'400.00');assert.equal(usdRow.outstanding,'610.00');assert.equal(usdRow.overdue,'610.00');assert.equal(usdRow.issuedInvoices,1);assert.equal(usdRow.creditNotes,1);
  assert.equal(eurRow.netSales,'500.00');assert.equal(eurRow.grossProfit,'200.00');assert.equal(eurRow.marginPercent,'40.00');assert.equal(eurRow.collected,'100.00');assert.equal(eurRow.outstanding,'400.00');
  assert.equal(rows.some(row=>row.currency==='ALL'),false);
});

test('v135 collection follows payment date while sales follow document issue date',()=>{
  const doc=invoice();const payments=[payment(doc,{id:'pay-jan',amount:'400.00',date:'2026-01-15'}),payment(doc,{id:'pay-feb',amount:'100.00',date:'2026-02-10'})];
  const feb=financialReportByCurrency([doc],payments,'2026-02-01','2026-02-28')[0];
  assert.equal(feb.netSales,'0.00');assert.equal(feb.collected,'100.00');assert.equal(feb.outstanding,'500.00');assert.equal(feb.overdue,'500.00');
  const jan=financialReportByCurrency([doc],payments,'2026-01-01','2026-01-31')[0];
  assert.equal(jan.netSales,'1000.00');assert.equal(jan.collected,'400.00');assert.equal(jan.outstanding,'600.00');
});

test('v135 withholds gross profit and margin when any direct item cost is missing',()=>{
  const incomplete=invoice({cost:''});const rows=financialReportByCurrency([incomplete],[],'2026-01-01','2026-01-31');
  assert.equal(rows[0].netSales,'1000.00');assert.equal(rows[0].profitComplete,false);assert.equal(rows[0].missingCostItems,1);assert.equal(rows[0].grossProfit,'');assert.equal(rows[0].marginPercent,'');assert.equal(rows[0].outstanding,'1000.00');
  const customers=customerPerformanceReport([customer('cust-a','Alpha')],[incomplete],[],'2026-01-01','2026-01-31');
  assert.equal(customers[0].grossProfit,'');assert.equal(customers[0].profitComplete,false);
});

test('v135 customer performance stays currency-specific and sorts large money values exactly',()=>{
  const a=invoice({id:'big-a',number:'INV-A',price:'900000000000000000000000000000.00',cost:'1.00',customerId:'cust-a',customerName:'Alpha'});
  const b=invoice({id:'big-b',number:'INV-B',price:'800000000000000000000000000000.00',cost:'1.00',customerId:'cust-b',customerName:'Beta'});
  const eur=invoice({id:'big-eur',number:'INV-EUR',currency:'EUR',price:'999999999999999999999999999999.00',cost:'1.00',customerId:'cust-a',customerName:'Alpha'});
  const rows=customerPerformanceReport([customer('cust-a','Alpha'),customer('cust-b','Beta')],[b,eur,a],[],'2026-01-01','2026-01-31');
  assert.deepEqual(rows.map(row=>`${row.currency}:${row.customerName}`),['EUR:Alpha','USD:Alpha','USD:Beta']);
});

test('v135 monthly trend groups issue and receipt activity by month and currency',()=>{
  const usd=invoice();const eur=invoice({id:'eur',number:'INV-EUR',currency:'EUR',price:'500.00',cost:'300.00',issueDate:'2026-02-05',dueDate:'2026-03-01',customerId:'cust-b',customerName:'Beta'});
  const rows=monthlyPerformanceReport([usd,eur],[payment(usd,{amount:'100.00',date:'2026-02-10'})],'2026-01-01','2026-02-28');
  assert.deepEqual(rows.map(row=>`${row.month}:${row.currency}`),['2026-01:USD','2026-02:EUR','2026-02:USD']);
  assert.equal(rows.find(row=>row.month==='2026-02'&&row.currency==='USD').netSales,'0.00');
  assert.equal(rows.find(row=>row.month==='2026-02'&&row.currency==='USD').collected,'100.00');
});

test('v135 ignores draft voided and proforma documents in financial performance',()=>{
  const active=invoice();const draft=invoice({id:'draft',number:'INV-D'});draft.status='draft';const voided=invoice({id:'void',number:'INV-V'});voided.lifecycleStatus='voided';const quote=createBlankDocument('proforma','PI-1',company);quote.status='final';quote.issueDate='2026-01-10';quote.items=[{...quote.items[0],descriptionEn:'Quote',unitPrice:'999.00',unitCost:'1.00'}];
  const rows=financialReportByCurrency([active,draft,voided,quote],[],'2026-01-01','2026-01-31');
  assert.equal(rows[0].netSales,'1000.00');assert.equal(rows[0].issuedInvoices,1);
  assert.deepEqual(normalizeReportPeriod('2026-03-31','2026-01-01'),{from:'2026-01-01',to:'2026-03-31'});
});

test('v135 ships reports navigation print CSV and offline assets without combining currencies',async()=>{
  const [app,shell,page,logic,html,sw,css,recoveryCss]=await Promise.all([read('src/app/App.tsx'),read('src/components/AppShell.tsx'),read('src/components/ReportsPage.tsx'),read('src/lib/reports.ts'),read('index.html'),read('public/sw.js'),read('src/styles/reports-v135.css'),read('src/styles/ux-recovery-v152.css')]);
  assert.ok(app.includes("|'reports'|"),'reports screen remains in the application state');assert.ok(shell.includes("t('Reports','التقارير')"));assert.ok(app.includes('<ReportsPage'));
  for(const term of ['Financial Reports','This Month','This Quarter','This Year','All Time','Export CSV','Print / Save PDF','Monthly Performance','Customer Performance','All currencies — separate'])assert.ok(page.includes(term),term);
  assert.ok(page.includes('Currencies are never combined or converted automatically'));
  assert.ok(logic.includes('receivablesByCurrency(asOfDocuments'));
  assert.ok(!logic.includes('exchangeRate'));assert.ok(!logic.includes('fxRate'));assert.ok(!logic.includes('convertCurrency'));
  assert.ok(html.includes('reports-v135.css'));assert.ok(html.indexOf('reports-v135.css')<html.indexOf('performance-polish-v100.css'));
  for(const asset of ['reports-v135.css','ReportsPage.js','reports.js'])assert.ok(sw.includes(asset),asset);
  assert.ok(/^const CACHE = 'lourex-invoice-v\d+';/m.test(sw));assert.ok(sw.includes("const CACHE = 'lourex-invoice-v135'"));assert.ok(sw.includes("const CACHE = 'lourex-invoice-v134'"));
  assert.ok(css.includes('printing-financial-report'));assert.ok(css.includes('@media print'));assert.ok(!css.includes('.app-ui .main-nav'),'reports no longer overrides shared navigation');assert.ok(recoveryCss.includes('.app-ui .main-nav button'),'legacy recovery layer remains beneath the new app shell');
});
