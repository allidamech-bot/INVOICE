import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { defaultCompany, customerSnapshotFrom } from '../dist/src/lib/defaults.js';
import { documentDisplayValue, documentLanguageMismatch, hasDocumentLanguageMismatch } from '../dist/src/lib/document-language.js';
import { estimatedDocumentPageCount } from '../dist/src/lib/document-quality.js';

const read=path=>readFile(path,'utf8');

test('neutral commercial locations remain visible in Arabic documents',()=>{
  assert.equal(documentDisplayValue('Ambarli Port','ar','neutral'),'Ambarli Port');
  assert.equal(documentDisplayValue('Riyadh Distribution Center','ar','neutral'),'Riyadh Distribution Center');
});

test('custom item units survive document-language filtering',()=>{
  assert.equal(documentDisplayValue('PCS','ar','unit'),'قطعة');
  assert.equal(documentDisplayValue('Bottle','ar','unit'),'Bottle');
  assert.equal(documentDisplayValue('عبوة خاصة','en','unit'),'عبوة خاصة');
  assert.equal(documentLanguageMismatch('Bottle','ar','unit'),false);
  assert.equal(documentLanguageMismatch('عبوة خاصة','en','unit'),false);
});

test('legal names and commercial locations do not create false language mismatch warnings',()=>{
  const company=defaultCompany();
  company.nameAr='لوركس';
  company.city='Istanbul';
  company.bank.bankName='Example Bank';
  company.bank.accountName='LOUREX TRADING';
  company.footerText='';
  company.defaultPaymentTerms='';
  company.defaultDeliveryTime='';
  const doc=createBlankDocument('proforma','PI-2026-0100',company);
  doc.language='ar';
  doc.customerSnapshot=customerSnapshotFrom({id:'c1',companyNameEn:'',companyNameAr:'العميل',contactPerson:'',addressEn:'',addressAr:'الرياض',city:'Riyadh',country:'Saudi Arabia',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''});
  doc.items[0].descriptionEn='';
  doc.items[0].descriptionAr='منتج';
  doc.items[0].unit='Bottle';
  doc.terms={incoterm:'FOB',paymentTerms:'',packing:'',deliveryTime:'',portOfLoading:'Ambarli Port',finalDestination:'Riyadh Distribution Center',countryOfOrigin:'Türkiye',validity:'',remarks:''};
  doc.notes='';
  assert.equal(hasDocumentLanguageMismatch(doc),false);
});

test('quality pagination counts long neutral commercial locations in Arabic output',()=>{
  const company=defaultCompany();
  company.nameAr='لوركس';
  company.footerText='';
  company.defaultPaymentTerms='';
  company.defaultDeliveryTime='';
  const doc=createBlankDocument('proforma','PI-2026-0101',company);
  doc.language='ar';
  doc.appearance.showBank=false;
  doc.customerSnapshot=customerSnapshotFrom({id:'c2',companyNameEn:'',companyNameAr:'العميل',contactPerson:'',addressEn:'',addressAr:'الرياض',city:'Riyadh',country:'Saudi Arabia',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''});
  doc.items[0].descriptionEn='';
  doc.items[0].descriptionAr='منتج';
  doc.terms={incoterm:'',paymentTerms:'',packing:'',deliveryTime:'',portOfLoading:`Port ${'A'.repeat(600)}`,finalDestination:'',countryOfOrigin:'',validity:'',remarks:''};
  doc.notes='';
  assert.equal(estimatedDocumentPageCount(doc),2);
});

test('renderer preserves commercial location direction and shows the tax rate in Arabic',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/key==='Port of Loading'\|\|key==='Final Destination'\?'neutral'/);
  assert.match(renderer,/safeValue\(doc,t\.portOfLoading,'neutral'\)/);
  assert.match(renderer,/safeValue\(doc,t\.finalDestination,'neutral'\)/);
  assert.match(renderer,/<span dir="auto">\{row\[2\]\}<\/span>/);
  assert.match(renderer,/const taxRate=doc\.adjustments\.taxEnabled\?`\$\{doc\.adjustments\.taxPercent\}%`/);
  assert.match(renderer,/`الضريبة \$\{taxRate\}`\.trim\(\)/);
});
