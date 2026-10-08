import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {defaultCompany} from '../dist/src/lib/defaults.js';
import {financialDocuments} from '../dist/src/lib/reports.js';
import {invoiceProfitabilityRows,productProfitabilityRows} from '../dist/src/lib/profitability-dimensions.js';

function invoice(){
  const doc=createBlankDocument('invoice','INV-B08-001',defaultCompany());
  doc.id='invoice-b08';doc.status='final';doc.lifecycleStatus='active';doc.role='standard';
  doc.currency='USD';doc.issueDate='2026-01-10';doc.dueDate='2026-02-10';
  doc.customerSnapshot={...doc.customerSnapshot,sourceCustomerId:'customer-b08',companyNameEn:'B08 Customer'};
  doc.items=[
    {...doc.items[0],id:'item-a',descriptionEn:'Missing cost',quantity:'1',unitPrice:'100.00',unitCost:''},
    {...doc.items[0],id:'item-b',descriptionEn:'Known cost',quantity:'1',unitPrice:'100.00',unitCost:'30.00'}
  ];
  doc.adjustments={...doc.adjustments,discountEnabled:false,shippingEnabled:false,otherChargesEnabled:false,taxEnabled:false};
  doc.internalCosts={shippingCost:'20.00',otherCost:'0.00'};
  return doc;
}

test('B08: missing-cost product does not transfer its overhead to the costed product',()=>{
  const doc=invoice();
  const rows=productProfitabilityRows([doc],[]);
  const unknown=rows.find(row=>row.label==='Missing cost');
  const known=rows.find(row=>row.label==='Known cost');
  assert.equal(unknown.profitComplete,false);
  assert.equal(unknown.totalCost,'');
  assert.equal(unknown.grossProfit,'');
  assert.equal(known.netSales,'100.00');
  assert.equal(known.totalCost,'40.00'); // 30 direct cost + its own 10 of overhead
  assert.equal(known.grossProfit,'60.00');
  assert.equal(known.marginPercent,'60.00');
});

test('B08: allocation does not depend on missing-cost row order and complete totals reconcile',()=>{
  const doc=invoice();
  doc.items[0].unitCost='10.00';doc.items[1].unitCost='';
  const first=productProfitabilityRows([doc],[]).find(row=>row.label==='Missing cost');
  assert.equal(first.totalCost,'20.00'); // 10 direct + 10 proportional overhead
  assert.equal(first.grossProfit,'80.00');
  const second=productProfitabilityRows([doc],[]).find(row=>row.label==='Known cost');
  assert.equal(second.profitComplete,false);
  doc.items[1].unitCost='30.00';
  const all=productProfitabilityRows([doc],[]);
  assert.equal(all.reduce((sum,row)=>sum+Number(row.totalCost),0),60);
  assert.equal(all.reduce((sum,row)=>sum+Number(row.grossProfit),0),140);
});

test('B08: period credit is included only with a valid earlier source invoice, orphan and invalid date excluded',()=>{
  const source=invoice();
  const credit={...invoice(),id:'credit-b08',number:'CN-B08-001',role:'credit-note',
    creditForId:source.id,creditForNumber:source.number,issueDate:'2026-02-05',
    items:[{...source.items[0],id:'credit-line',unitCost:'5.00',unitPrice:'20.00'}],
    internalCosts:{shippingCost:'0.00',otherCost:'0.00'}};
  const orphan={...credit,id:'orphan-credit',creditForId:'not-a-real-invoice'};
  const invalid={...credit,id:'invalid-credit',issueDate:'2026-02-31'};
  const docs=financialDocuments([source,credit,orphan,invalid]);
  assert.deepEqual(docs.map(doc=>doc.id),[source.id,credit.id]);
  const feb=docs.filter(doc=>doc.issueDate>='2026-02-01'&&doc.issueDate<='2026-02-28');
  assert.deepEqual(feb.map(doc=>doc.id),[credit.id]);
  const row=invoiceProfitabilityRows(feb)[0];
  assert.equal(row.netSales,'-20.00');
  assert.equal(row.totalCost,'-5.00');
  assert.equal(row.grossProfit,'-15.00');
});

test('B08: the profitability screen validates source links before applying the period and excludes malformed dates',async()=>{
  const source=await readFile('src/components/ProfitabilityReports.tsx','utf8');
  assert.match(source,/financialDocuments\(props\.documents\)\.filter\(doc=>isIsoDate\(doc\.issueDate\)/);
  assert.match(source,/const period=normalizeReportPeriod\(from,to\)/);
  assert.match(source,/doc\.issueDate>=period\.from/);
  assert.match(source,/doc\.issueDate<=period\.to/);
  assert.match(source,/customerPerformanceReport\(props\.customers,props\.documents,props\.payments,period\.from,period\.to\)/);
  assert.doesNotMatch(source,/!doc\.issueDate\|\|/);
});

test('B08: reversed credit-note allocation preserves signed cost and overhead per product',()=>{
  const credit=invoice();
  credit.role='credit-note';
  credit.items[0].unitCost='10.00';
  const rows=productProfitabilityRows([credit],[]);
  const first=rows.find(row=>row.label==='Missing cost');
  const second=rows.find(row=>row.label==='Known cost');
  assert.equal(first.netSales,'-100.00');
  assert.equal(first.totalCost,'-20.00');
  assert.equal(first.grossProfit,'-80.00');
  assert.equal(second.netSales,'-100.00');
  assert.equal(second.totalCost,'-40.00');
  assert.equal(second.grossProfit,'-60.00');
  assert.equal(rows.reduce((sum,row)=>sum+Number(row.totalCost),0),-60);
  assert.equal(rows.reduce((sum,row)=>sum+Number(row.grossProfit),0),-140);
});
