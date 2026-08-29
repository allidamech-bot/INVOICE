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

test('quality multi-page warning accounts for real party and final-details pressure',async()=>{
  const documents=await import('../dist/src/lib/documents.js');
  const quality=await import('../dist/src/lib/document-quality.js');
  const defaults=await import('../dist/src/lib/defaults.js');
  const doc=documents.createBlankDocument('proforma','PI-2026-0009',defaults.defaultCompany());
  doc.language='bilingual';
  doc.customerSnapshot={companyNameEn:'Customer International Trading Company',companyNameAr:'شركة العميل الدولية للتجارة',contactName:'',addressEn:'A long commercial address used to create realistic first-page pressure across the A4 document',addressAr:'عنوان تجاري طويل لاختبار ضغط بيانات العميل على الصفحة الأولى من المستند',city:'Riyadh',country:'Saudi Arabia',phone:'+966500000000',email:'buyer@example.com',vatTaxNumber:'310000000000003',commercialRegistration:'1010000000'};
  doc.companySnapshot={...doc.companySnapshot,addressEn:'A long company commercial address used in the document header and seller block',addressAr:'عنوان الشركة التجاري الطويل المستخدم في بيانات البائع ضمن المستند',city:'Homs',country:'Syria',phone:'+963000000000',email:'sales@example.com',website:'example.com',vatNumber:'VAT-123456',taxNumber:'TAX-123456',commercialRegistration:'CR-123456'};
  doc.items=Array.from({length:6},(_,index)=>({...documents.emptyItem(),descriptionEn:`Commercial product ${index+1}`,descriptionAr:`منتج تجاري ${index+1}`,unitPrice:'100.00'}));
  assert.ok(quality.estimatedDocumentPageCount(doc)>1);
  assert.ok(quality.documentQualityIssues(doc).some(issue=>issue.code==='multi-page'));
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
