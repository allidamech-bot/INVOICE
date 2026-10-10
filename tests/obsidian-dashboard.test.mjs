import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('dashboard keeps deterministic finance KPIs and readable current TailAdmin hierarchy',async()=>{
 const [home,css]=await Promise.all([read('src/components/WorkspaceHome.tsx'),read('src/styles/tailadmin-dashboard-v320.css')]);
 for(const metric of ['Sales','Collected','Outstanding','Overdue'])assert.ok(home.includes(metric),metric);
 for(const value of ['row.netSales','row.collected','row.outstanding','row.overdue'])assert.ok(home.includes(value),value);
 assert.ok(home.includes('ta-dashboard'),'dashboard uses the approved screen owner');
 assert.ok(css.includes('.ta-dashboard')&&css.includes('var(--ft-surface)'));
 assert.ok(!css.includes('.invoice-page'),'dashboard UI cannot override printed invoices');
});

test('dashboard uses existing accounting and payment status logic without changing schemas',async()=>{
  const [home,app]=await Promise.all([read('src/components/WorkspaceHome.tsx'),read('src/app/App.tsx')]);
  for(const token of ['financialReportByCurrency','receivablesByCurrency','invoicePaymentSummary','calculateTotals'])assert.ok(home.includes(token),token);
  assert.ok(app.includes('onNewDocument={()=>this.setState({newMenu:true})}'));
  assert.ok(!home.includes('onNewQuotation'));
  assert.ok(!home.includes('onNewInvoice'));
});
