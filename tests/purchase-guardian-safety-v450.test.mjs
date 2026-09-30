import test from 'node:test';
import assert from 'node:assert/strict';
import { createPurchase, createPurchaseItem, createSupplier } from '../dist/src/lib/operations.js';
import { buildPurchaseGuardianReview } from '../dist/src/lib/purchase-guardian.js';

function savedItem(){
  return {
    id:'guardian-product',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',
    sku:'GUARD-1',descriptionEn:'Guardian Product',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'CTN',
    lastUnitPrice:'',lastCurrency:'',lastUnitCost:'100.00',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'',
    category:'',tags:[],favorite:false,archived:false
  };
}

function draftPurchase(){
  const supplier=createSupplier();supplier.id='guardian-supplier';supplier.nameEn='Guardian Supplier';
  const item=savedItem();const purchase=createPurchase([], [supplier], 'USD');
  const line=createPurchaseItem(item);line.quantity='1';line.unit='';line.unitCost='40.00';line.landedUnitCost='';
  purchase.items=[line];purchase.freight='';purchase.duty='';purchase.otherCosts='';purchase.status='draft';
  return {purchase,item};
}

test('v450 purchase guardian preserves unknown landed-cost components and withholds derived anomaly comparison',()=>{
  const {purchase,item}=draftPurchase();
  const review=buildPurchaseGuardianReview(purchase,[item]);
  assert.ok(review.issues.some(issue=>issue.code==='missing-landed-cost-components'));
  assert.ok(review.issues.some(issue=>issue.code==='missing-unit'));
  assert.ok(!review.issues.some(issue=>issue.code==='abnormal-landed-cost'));
  assert.ok(review.limitations.includes('landed-cost-comparison-withheld-when-any-landed-component-is-missing'));
  assert.ok(review.limitations.includes('missing-units-are-never-defaulted'));
});

test('v450 purchase guardian can compare landed cost only after every landed component is explicitly stated',()=>{
  const {purchase,item}=draftPurchase();
  purchase.freight='0.00';purchase.duty='0.00';purchase.otherCosts='0.00';purchase.items[0].unit='CTN';
  const review=buildPurchaseGuardianReview(purchase,[item]);
  assert.ok(!review.issues.some(issue=>issue.code==='missing-landed-cost-components'));
  assert.ok(review.issues.some(issue=>issue.code==='abnormal-landed-cost'));
});

test('v450 purchase guardian reports unknown currency instead of performing currency-sensitive comparisons',()=>{
  const {purchase,item}=draftPurchase();
  purchase.currency='';purchase.freight='0.00';purchase.duty='0.00';purchase.otherCosts='0.00';purchase.items[0].unit='CTN';
  const review=buildPurchaseGuardianReview(purchase,[item]);
  assert.ok(review.issues.some(issue=>issue.code==='missing-currency'&&issue.severity==='critical'));
  assert.ok(!review.issues.some(issue=>issue.code==='cost-currency-mismatch'));
  assert.ok(!review.issues.some(issue=>issue.code==='abnormal-landed-cost'));
});
