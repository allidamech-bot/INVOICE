import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTotals, decimalToScaled, isDecimalInput, lineTotal } from '../dist/src/lib/money.js';
import { createBlankDocument, validateDocument } from '../dist/src/lib/documents.js';
import { customerSnapshotFrom, defaultCompany } from '../dist/src/lib/defaults.js';

function localizedDocument(){
  const doc=createBlankDocument('invoice','INV-2026-0257',defaultCompany());
  doc.customerSnapshot=customerSnapshotFrom({id:'c257',companyNameEn:'Buyer',companyNameAr:'المشتري',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''});
  doc.language='ar';
  doc.items[0].descriptionAr='صنف تجريبي';
  doc.items[0].quantity='٢٫٥';
  doc.items[0].unitPrice='٤٫٢٠';
  doc.adjustments.discountEnabled=true;
  doc.adjustments.discountMode='percent';
  doc.adjustments.discountValue='١٠';
  doc.adjustments.shippingEnabled=true;
  doc.adjustments.shipping='١٫٥٠';
  doc.adjustments.taxEnabled=true;
  doc.adjustments.taxPercent='١٥';
  return doc;
}

test('localized invoice values validate and calculate with the canonical fixed-precision rules',()=>{
  const doc=localizedDocument();
  assert.deepEqual(validateDocument(doc),{});
  assert.equal(lineTotal(doc.items[0].quantity,doc.items[0].unitPrice),'10.50');
  assert.deepEqual(calculateTotals(doc.items,doc.adjustments),{
    subtotal:'10.50',discount:'1.05',shipping:'1.50',otherCharges:'0.00',tax:'1.64',grandTotal:'12.59'
  });
});

test('Arabic grouping separators are accepted only when structurally valid',()=>{
  assert.equal(decimalToScaled('١٬٢٣٤٫٥٦',2),123456n);
  assert.equal(isDecimalInput('١٬٢٣٤٫٥٦'),true);
  assert.equal(isDecimalInput('١٢٬٣٤٫٥٦'),false);
  assert.equal(isDecimalInput('١٬٢٣٬٤٥٦'),false);
});

test('Persian digits receive the same validation semantics as ASCII values',()=>{
  const doc=localizedDocument();
  doc.items[0].quantity='۲٫۵';
  doc.items[0].unitPrice='۴٫۲۰';
  doc.adjustments.discountValue='۱۰';
  doc.adjustments.shipping='۱٫۵۰';
  doc.adjustments.taxPercent='۱۵';
  assert.deepEqual(validateDocument(doc),{});
  assert.equal(calculateTotals(doc.items,doc.adjustments).grandTotal,'12.59');
});
