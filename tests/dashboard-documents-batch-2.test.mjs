import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('batch 2 home is an operational dashboard backed by existing accounting logic',async()=>{
  const [home,app]=await Promise.all([read('src/components/WorkspaceHome.tsx'),read('src/app/App.tsx')]);
  for(const token of ['receivablesByCurrency','financialReportByCurrency','Open quotations','Open invoices','Outstanding','Sales this month','Recent documents','Needs attention'])assert.ok(home.includes(token),token);
  assert.ok(home.includes('formatMoney(row.outstanding,row.currency)'));
  assert.ok(home.includes('formatMoney(row.netSales,row.currency)'));
  assert.ok(app.includes('documents={vault.documents}'));
  assert.ok(app.includes('payments={vault.payments}'));
  assert.ok(app.includes('onOpenDocument={(doc)=>void this.openDocument(doc)}'));
});

test('batch 2 documents provide richer search filters and one calm action surface',async()=>{
  const page=await read('src/components/DocumentsPage.tsx');
  for(const token of ['PaymentFilter','documentSearchText','paymentStatus','currency','partially-paid','overdue','Lowest total'])assert.ok(page.includes(token),token);
  assert.ok(page.includes("placeholder={t('Number, customer, item, HS code…'"));
  assert.ok(page.includes('item.descriptionEn'));
  assert.ok(page.includes('item.descriptionAr'));
  assert.ok(page.includes('item.hsCode'));
  assert.ok(page.includes('document-action-popover'));
  assert.ok(page.includes('mobile-document-action-portal'));
  assert.ok(page.includes('icon="more"'));
  assert.ok(page.includes('Convert to Invoice'));
});

test('batch 2 document cards open a detail view before editing',async()=>{
  const page=await read('src/components/DocumentsPage.tsx');
  for(const token of ['detailId','document-detail-page','Document overview','Commercial terms','document-detail-items','document-detail-payment','Remaining'])assert.ok(page.includes(token),token);
  assert.ok(page.includes("onClick={()=>this.setState({detailId:doc.id,menuId:''})}"));
  assert.ok(page.includes("onConvert={(d)=>void this.convert(d)}")===false,'App wiring belongs in App.tsx, not page implementation');
});

test('batch 2 styles are responsive app-only UI and remain offline-capable',async()=>{
  const [css,index,sw]=await Promise.all([read('src/styles/dashboard-documents.css'),read('index.html'),read('public/sw.js')]);
  for(const selector of ['.dashboard-kpis','.dashboard-main-grid','.document-action-popover','.document-detail-grid','.document-detail-item-row'])assert.ok(css.includes(selector),selector);
  assert.ok(css.includes('@media(max-width:720px)'));
  assert.ok(css.includes('@media print'));
  assert.ok(!css.includes('.invoice-page{'));
  assert.ok(!css.includes('.document-page{'));
  assert.ok(index.includes('./styles/dashboard-documents.css'));
  assert.ok(sw.includes('./styles/dashboard-documents.css'));
});

test('batch 2 App wires conversion and detail-capable documents without changing the editor contract',async()=>{
  const app=await read('src/app/App.tsx');
  assert.ok(app.includes('onConvert={(d)=>void this.convert(d)}'));
  assert.ok(app.includes('<EditorPage document={this.state.editorDoc}'));
  assert.ok(app.includes('onConvert={this.convert}'));
});
