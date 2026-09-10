import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('dashboard exposes the canonical executive financial hierarchy',async()=>{
  const [home,css]=await Promise.all([read('src/components/WorkspaceHome.tsx'),read('src/styles/dashboard-documents.css')]);
  for(const metric of ['Sales','Collected','Outstanding','Overdue'])assert.ok(home.includes(metric),metric);
  for(const value of ['row.netSales','row.collected','row.outstanding','row.overdue'])assert.ok(home.includes(value),value);
  for(const field of ['dashboard-document-customer','dashboard-document-date','dashboard-document-amount','dashboard-document-status'])assert.ok(home.includes(field),field);
  assert.match(css,/One financial instrument with four internally divided measures/);
  assert.match(css,/\.dashboard-kpis\{[^}]*background:var\(--ds-surface\)/);
  assert.match(css,/\.dashboard-kpis>button\{[^}]*border-radius:0/);
  assert.doesNotMatch(css,/\.dashboard-kpis>button\{[^}]*background:#fff/);
});

test('dashboard uses existing accounting and payment status logic without changing schemas',async()=>{
  const [home,app]=await Promise.all([read('src/components/WorkspaceHome.tsx'),read('src/app/App.tsx')]);
  for(const token of ['financialReportByCurrency','receivablesByCurrency','invoicePaymentSummary','calculateTotals'])assert.ok(home.includes(token),token);
  assert.ok(app.includes('onNewDocument={()=>this.setState({newMenu:true})}'));
  assert.ok(!home.includes('onNewQuotation'));
  assert.ok(!home.includes('onNewInvoice'));
});
