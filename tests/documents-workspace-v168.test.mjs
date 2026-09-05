import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('document search includes saved line-item and trade metadata',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/doc\.items\.flatMap\(item=>\[item\.descriptionEn,item\.descriptionAr,item\.hsCode,item\.origin,item\.packing,item\.unit\]\)/);
  assert.match(source,/Number, customer, item, HS code/);
  assert.match(source,/رقم، عميل، صنف، HS Code/);
});

test('final cancelled or voided documents remain exportable as archival copies',async()=>{
  const [documents,renderer]=await Promise.all([read('src/components/DocumentsPage.tsx'),read('src/templates/TemplateRenderer.tsx')]);
  assert.equal((documents.match(/const canOutput=doc\.status==='final';/g)||[]).length,2);
  assert.match(documents,/Open archive/);
  assert.match(documents,/فتح الأرشيف/);
  assert.match(renderer,/document-void-watermark/);
  assert.match(renderer,/localized\(doc,'CANCELLED','ملغى'\)/);
  assert.match(renderer,/localized\(doc,'VOID','ملغى'\)/);
});

test('issued and cancelled filters are mutually consistent with overview counts',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/type WorkspaceStatus='all'\|'draft'\|'ready'\|'final'\|'voided'/);
  assert.match(source,/function matchesWorkspaceStatus/);
  assert.match(source,/status==='voided'\)return doc\.lifecycleStatus==='voided'/);
  assert.match(source,/status==='final'\)return doc\.status==='final'&&doc\.lifecycleStatus!=='voided'/);
  assert.match(source,/value="voided">\{t\('Cancelled \/ Voided','ملغى'\)\}/);
  assert.match(source,/const issued=this\.props\.documents\.filter\(doc=>matchesWorkspaceStatus\(doc,'final'\)\)\.length/);
});

test('quotation detail uses Valid until rather than invoice due-date wording',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/doc\.kind==='invoice'\?t\('Due date','تاريخ الاستحقاق'\):t\('Valid until','صالح حتى'\)/);
  assert.doesNotMatch(source,/Validity \/ due/);
});

test('mobile document actions remain body-ported and dismissible',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/mobile-document-action-portal/);
  assert.match(source,/mobile-document-action-backdrop/);
  assert.match(source,/ReactDOM\.createPortal/);
  assert.match(source,/onClick=\{\(\)=>this\.setState\(\{menuId:''\}\)\}/);
});

test('payment filtering remains invoice-only and excludes voided invoices',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  assert.match(source,/doc\.kind!=='invoice'\|\|doc\.role==='credit-note'\|\|doc\.status!=='final'\|\|doc\.lifecycleStatus==='voided'/);
});
