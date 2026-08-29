import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('duplicated invoices preserve their relative due-date window',async()=>{
  const documents=await import('../dist/src/lib/documents.js');
  const defaults=await import('../dist/src/lib/defaults.js');
  const source=documents.createBlankDocument('invoice','INV-2026-0001',defaults.defaultCompany());
  source.issueDate='2026-01-01';
  source.dueDate='2026-01-31';
  const copy=documents.duplicateDocument(source,'INV-2026-0002');
  assert.notEqual(copy.dueDate,'');
  const start=Date.parse(`${copy.issueDate}T00:00:00Z`);
  const end=Date.parse(`${copy.dueDate}T00:00:00Z`);
  assert.equal(Math.round((end-start)/86_400_000),30);
});

test('document customer state treats blank snapshots as missing everywhere',async()=>{
  const documents=await import('../dist/src/lib/documents.js');
  const defaults=await import('../dist/src/lib/defaults.js');
  const doc=documents.createBlankDocument('proforma','PI-2026-0001',defaults.defaultCompany());
  doc.customerSnapshot={companyNameEn:'   ',companyNameAr:'',contactName:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  assert.equal(documents.hasDocumentCustomer(doc),false);
  assert.equal(documents.validateDocument(doc).customer,'Select a customer.');
  const workspace=read('src/components/DocumentsPage.tsx');
  assert.match(workspace,/hasDocumentCustomer\(doc\)/);
});

test('v82 quote and invoice UX layer is loaded last and shipped offline',()=>{
  const html=read('index.html');
  const sw=read('public/sw.js');
  const css=read('src/styles/document-ux-v82.css');
  assert.match(html,/document-ux-v82\.css/);
  assert.ok(html.indexOf('document-ux-v82.css')>html.indexOf('mobile-modal-v81.css'));
  assert.match(sw,/lourex-invoice-v82/);
  assert.match(sw,/document-ux-v82\.css/);
  assert.match(css,/\.editor-topbar/);
  assert.match(css,/\.mobile-editor-actionbar/);
  assert.match(css,/\.modal-footer/);
  assert.match(css,/\.premium-document-card/);
  assert.match(css,/@media print/);
});
