import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument, validateDocument } from '../dist/src/lib/documents.js';

test('document validation rejects tiny negative price and adjustments before rounding',()=>{
  const company=emptyVault().company;
  const doc=createBlankDocument('invoice','INV-2026-0001',company);
  doc.customerSnapshot={sourceCustomerId:'customer-1',companyNameEn:'Customer',companyNameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  doc.items=[{id:'line-1',descriptionEn:'Item',descriptionAr:'',hsCode:'',origin:'',packing:'',quantity:'1',unit:'PCS',unitPrice:'-0.00001',unitCost:''}];
  doc.adjustments={discountEnabled:true,discountMode:'fixed',discountValue:'-0.00001',shippingEnabled:true,shipping:'-0.00001',otherChargesEnabled:true,otherCharges:'-0.00001',taxEnabled:true,taxPercent:'-0.00001'};
  const errors=validateDocument(doc);
  assert.match(errors['item-0-price']||'',/0 or greater/i);
  assert.match(errors.discount||'',/0 or greater/i);
  assert.match(errors.shipping||'',/0 or greater/i);
  assert.match(errors.otherCharges||'',/0 or greater/i);
  assert.match(errors.tax||'',/0 or greater/i);
});
