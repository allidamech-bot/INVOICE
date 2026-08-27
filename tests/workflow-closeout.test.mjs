import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBlankDocument, convertToInvoice, duplicateDocument } from '../dist/src/lib/documents.js';
import { defaultCompany } from '../dist/src/lib/defaults.js';
import { documentQualityIssues } from '../dist/src/lib/document-quality.js';

const read=path=>readFile(path,'utf8');

function validQuote(){
  const company=defaultCompany();company.nameEn='LOUREX';company.defaultValidityDays=7;
  const doc=createBlankDocument('proforma','PI-2026-0001',company);
  doc.customerSnapshot={sourceCustomerId:'c1',companyNameEn:'ACME',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  doc.items[0].descriptionEn='Product';doc.items[0].quantity='2';doc.items[0].unit='Carton';doc.items[0].unitPrice='10';
  return doc;
}

test('conversion preserves source identity and writes visible source reference',()=>{
  const source=validQuote();
  const invoice=convertToInvoice(source,'INV-2026-0001');
  assert.equal(invoice.kind,'invoice');
  assert.equal(invoice.status,'draft');
  assert.equal(invoice.convertedFromId,source.id);
  assert.match(invoice.terms.remarks,/PI-2026-0001/);
  assert.equal(source.kind,'proforma');
});

test('duplicate receives a new identity and returns to draft with refreshed dates',()=>{
  const source=validQuote();source.status='final';
  const copy=duplicateDocument(source,'PI-2026-0002');
  assert.notEqual(copy.id,source.id);
  assert.equal(copy.number,'PI-2026-0002');
  assert.equal(copy.status,'draft');
  assert.equal(copy.convertedFromId,'');
  assert.notEqual(copy.items[0].id,source.items[0].id);
});

test('quality guard warns without treating optional presentation gaps as validation blockers',()=>{
  const doc=validQuote();doc.appearance.showBank=true;doc.appearance.showSignature=true;doc.items[0].unitPrice='0';
  const codes=documentQualityIssues(doc).map(issue=>issue.code);
  assert.ok(codes.includes('logo-missing'));
  assert.ok(codes.includes('bank-incomplete'));
  assert.ok(codes.includes('signature-missing'));
  assert.ok(codes.includes('zero-price'));
});

test('editor contains final lock, review-before-issue and advanced simplification',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  assert.match(editor,/Review before issue|DocumentReviewModal/);
  assert.match(editor,/Unlock for editing/);
  assert.match(editor,/editor-form-lock/);
  assert.match(editor,/Advanced options/);
  assert.match(editor,/status:'final'/);
});

test('documents workspace supports ready state, sorting and final-only direct output',async()=>{
  const docs=await read('src/components/DocumentsPage.tsx');
  assert.match(docs,/Highest total/);
  assert.match(docs,/workflowStatus/);
  assert.match(docs,/status-\$\{state\}/);
  assert.match(docs,/'ready'/);
  assert.match(docs,/const canOutput=doc\.status==='final'/);
  assert.match(docs,/Review & Issue/);
});

test('root UI is protected by a recovery boundary instead of falling to a blank page',async()=>{
  const index=await read('src/app/index.tsx');
  const boundary=await read('src/app/AppErrorBoundary.tsx');
  assert.match(index,/AppErrorBoundary/);
  assert.match(index,/<AppErrorBoundary><App\/><\/AppErrorBoundary>/);
  assert.match(boundary,/getDerivedStateFromError/);
  assert.match(boundary,/window\.location\.reload/);
});

test('PWA closeout assets are offline-cached',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v44/);
  assert.match(sw,/workflow-closeout\.css/);
  assert.match(sw,/DocumentReviewModal\.js/);
  assert.match(sw,/document-quality\.js/);
  assert.match(sw,/AppErrorBoundary\.js/);
  assert.match(sw,/EditorPageCore\.js/);
});
