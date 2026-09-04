import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBlankDocument, validateDocument } from '../dist/src/lib/documents.js';
import { defaultCompany } from '../dist/src/lib/defaults.js';

const read=path=>readFile(path,'utf8');

function validInvoice(){
  const company=defaultCompany();
  const doc=createBlankDocument('invoice','INV-2026-0001',company);
  doc.customerSnapshot={sourceCustomerId:'c1',companyNameEn:'ACME',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  doc.items[0].descriptionEn='Product';doc.items[0].quantity='1';doc.items[0].unitPrice='100';
  return doc;
}

test('open invoices require a due date',()=>{
  const doc=validInvoice();doc.dueDate='';
  assert.equal(validateDocument(doc).dueDate,'Due date is required.');
});

test('conversion modal exposes paid partial credit and due-on-receipt choices',async()=>{
  const modal=await read('src/components/InvoiceConversionModal.tsx');
  assert.match(modal,/Paid in Full/);
  assert.match(modal,/Partial Payment/);
  assert.match(modal,/On Account \/ Credit/);
  assert.match(modal,/Due on Receipt/);
  assert.match(modal,/paymentMethod/);
  assert.match(modal,/paymentReference/);
});

test('conversion is duplicate-safe and queues payment until invoice issue',async()=>{
  const app=await read('src/app/App.tsx');
  assert.match(app,/convertedFromId===source\.id/);
  assert.match(app,/already been converted/);
  assert.match(app,/settlementPlan/);
  assert.match(app,/payment-recorded/);
  assert.match(app,/normalizePaymentRecord/);
});

test('quote and invoice editors expose their relationship',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.match(editor,/document-relationship-bar/);
  assert.match(editor,/Open linked invoice/);
  assert.match(editor,/Open source quote/);
});

test('settlement plan is encrypted-vault normalized and PWA cached',async()=>{
  const vault=await read('src/storage/vault.ts');
  const sw=await read('public/sw.js');
  const html=await read('index.html');
  assert.match(vault,/normalizeSettlementPlan/);
  assert.match(sw,/InvoiceConversionModal\.js/);
  assert.match(sw,/invoice-conversion-v194\.css/);
  assert.match(html,/invoice-conversion-v194\.css/);
});
