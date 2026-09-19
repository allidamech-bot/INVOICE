import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { defaultCompany } from '../dist/src/lib/defaults.js';
import { calculateProfitability } from '../dist/src/lib/profitability.js';

test('v266 profitability preserves high-precision landed unit costs through quantity multiplication',()=>{
  const company=defaultCompany();
  const doc=createBlankDocument('invoice','INV-2026-9999',company);
  doc.items=[{...doc.items[0],descriptionEn:'High volume item',quantity:'1000',unitPrice:'2.00',unitCost:'1.00001'}];
  doc.adjustments={...doc.adjustments,discountEnabled:false,shippingEnabled:false,otherChargesEnabled:false,taxEnabled:false};
  doc.internalCosts={shippingCost:'0.00',otherCost:'0.00'};
  const result=calculateProfitability(doc);
  assert.equal(result.itemCost,'1000.01');
  assert.equal(result.netRevenue,'2000.00');
  assert.equal(result.grossProfit,'999.99');
  assert.equal(result.complete,true);
});
