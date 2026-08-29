import test from 'node:test';
import assert from 'node:assert/strict';
import { decimalToScaled, formatMoney, isDecimalInput, lineTotal } from '../dist/src/lib/money.js';
import { createBlankDocument, validateDocument } from '../dist/src/lib/documents.js';
import { customerSnapshotFrom, defaultCompany } from '../dist/src/lib/defaults.js';

function validDocument(){
  const doc=createBlankDocument('invoice','INV-2026-0001',defaultCompany());
  doc.customerSnapshot=customerSnapshotFrom({id:'c1',companyNameEn:'Buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''});
  doc.items[0].descriptionEn='Product';
  doc.items[0].quantity='1';
  doc.items[0].unitPrice='10';
  return doc;
}

test('fixed-precision parser rounds excess decimals instead of silently truncating them',()=>{
  assert.equal(decimalToScaled('1.005',2),101n);
  assert.equal(decimalToScaled('1.004',2),100n);
  assert.equal(decimalToScaled('-1.005',2),-101n);
  assert.equal(lineTotal('1','1.005'),'1.01');
});

test('financial validation accepts the same decimal grammar used by calculations',()=>{
  assert.equal(isDecimalInput('100.25'),true);
  assert.equal(isDecimalInput('.5'),true);
  assert.equal(isDecimalInput('1e2'),false);
  assert.equal(isDecimalInput('Infinity'),false);
  assert.equal(isDecimalInput('NaN'),false);

  const doc=validDocument();
  doc.items[0].quantity='1e2';
  assert.ok(validateDocument(doc)['item-0-quantity']);
  doc.items[0].quantity='1';
  doc.items[0].unitPrice='1e2';
  assert.ok(validateDocument(doc)['item-0-price']);
  doc.items[0].unitPrice='10';
  doc.adjustments.shippingEnabled=true;
  doc.adjustments.shipping='1e2';
  assert.ok(validateDocument(doc).shipping);
});

test('tax percentages are bounded to a valid 0–100 range',()=>{
  const doc=validDocument();
  doc.adjustments.taxEnabled=true;
  doc.adjustments.taxPercent='100';
  assert.equal(validateDocument(doc).tax,undefined);
  doc.adjustments.taxPercent='100.0001';
  assert.equal(validateDocument(doc).tax,'Tax percentage cannot exceed 100%.');
  doc.adjustments.taxPercent='-1';
  assert.equal(validateDocument(doc).tax,'Tax must be 0 or greater.');
});

test('quantities that round to zero at engine precision are rejected',()=>{
  const doc=validDocument();
  doc.items[0].quantity='0.00001';
  assert.ok(validateDocument(doc)['item-0-quantity']);
});

test('money formatting does not collapse very large fixed-precision values to zero',()=>{
  const huge='1234567890123456789012345678901234567890.12';
  assert.equal(formatMoney(huge,'USD'),'1,234,567,890,123,456,789,012,345,678,901,234,567,890.12 USD');
  assert.equal(formatMoney('-1000.5','EUR'),'-1,000.50 EUR');
});
