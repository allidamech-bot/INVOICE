import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {defaultCompany,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {estimatedDocumentPageCount} from '../dist/src/lib/document-quality.js';

function makeLongArabicTradeDoc(portLength){
  const company=defaultCompany();
  company.nameAr='لوركس';
  company.defaultPaymentTerms='';
  company.defaultDeliveryTime='';
  company.footerText='';
  const doc=createBlankDocument('proforma','QUO-2026-LONG',company);
  doc.language='ar';
  doc.appearance.showBank=false;
  doc.customerSnapshot=customerSnapshotFrom({
    id:'customer',companyNameEn:'',companyNameAr:'العميل',
    contactPerson:'',addressEn:'',addressAr:'الرياض',city:'Riyadh',
    country:'Saudi Arabia',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''
  });
  doc.items[0].descriptionEn='';
  doc.items[0].descriptionAr='منتج';
  doc.terms={
    incoterm:'',paymentTerms:'',packing:'',deliveryTime:'',
    portOfLoading:'Port '+('A'.repeat(portLength)),
    finalDestination:'',countryOfOrigin:'',validity:'',remarks:''
  };
  doc.notes='';
  return doc;
}

test('a single long port of loading cannot crowd A4 closing details and totals',()=>{
  assert.equal(estimatedDocumentPageCount(makeLongArabicTradeDoc(600)),2);
});

test('normal short trade terms do not create unnecessary blank closing pages',()=>{
  assert.equal(estimatedDocumentPageCount(makeLongArabicTradeDoc(120)),1);
});
