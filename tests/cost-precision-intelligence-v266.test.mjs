import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { pricingSuggestedUnitPrice } from '../dist/src/lib/commercial-controls.js';
import { buildProductPricingContext } from '../dist/src/lib/product-pricing-intelligence.js';
import { buildSupplierPurchasingContext } from '../dist/src/lib/supplier-purchasing-intelligence.js';
import { buildAiBusinessContext } from '../dist/src/lib/ai-business.js';
import { createPurchase, createPurchaseItem, createSupplier } from '../dist/src/lib/operations.js';

function savedItem(){
  return {
    id:'micro-cost-item',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-09-19T00:00:00.000Z',
    sku:'MICRO-1',descriptionEn:'Micro precision item',descriptionAr:'صنف دقة',hsCode:'1000',origin:'',packing:'',unit:'PCS',
    lastUnitPrice:'1.00000',lastCurrency:'USD',lastUnitCost:'1.00001',lastCostCurrency:'USD',usageCount:1,lastUsedAt:'2026-09-19T00:00:00.000Z',
    category:'Test',tags:[],favorite:false,archived:false
  };
}

function postedPurchase(item,supplierId,supplierName,date,unitCost){
  const supplier=createSupplier();supplier.id=supplierId;supplier.nameEn=supplierName;
  const purchase=createPurchase([], [supplier], 'USD');
  purchase.number=`PUR-${supplierId}`;purchase.date=date;purchase.status='posted';purchase.postedAt=`${date}T12:00:00.000Z`;
  const line=createPurchaseItem(item);line.quantity='1';line.unitCost=unitCost;line.landedUnitCost=unitCost;
  purchase.items=[line];
  return purchase;
}

test('v266 pricing policy preserves micro landed cost precision through cent rounding',()=>{
  const price=pricingSuggestedUnitPrice('1.00125',{method:'markup',percent:'33.33',rounding:'0.01'});
  assert.equal(price,'1.33');
});

test('v266 pricing, supplier and AI intelligence do not collapse costs after four decimals',()=>{
  const vault=emptyVault();
  const item=savedItem();
  vault.savedItems=[item];
  // Put the slightly more expensive supplier first/newer. Four-decimal comparison
  // treated these values as equal and incorrectly kept the first supplier.
  vault.purchases=[
    postedPurchase(item,'supplier-high','Higher micro cost','2026-09-19','1.00002'),
    postedPurchase(item,'supplier-low','Lower micro cost','2026-09-18','1.00001')
  ];
  vault.company.commercial.pricing={method:'markup',percent:'33.33',rounding:'0.01'};

  const pricing=buildProductPricingContext(vault,'pricing micro item','2026-09-19');
  const pricingRow=pricing.rows.find(row=>row.id===item.id);
  assert.ok(pricingRow);
  assert.equal(pricingRow.cost,'1.00001');
  assert.equal(pricingRow.pricingHealth,'below-cost');
  assert.ok(pricingRow.signals.includes('sale-price-below-cost'));

  const purchasing=buildSupplierPurchasingContext(vault,'micro item','2026-09-19');
  const comparison=purchasing.comparisons.find(row=>row.itemId===item.id);
  assert.ok(comparison);
  assert.equal(comparison.lowestUnitCostSupplierId,'supplier-low');
  assert.equal(comparison.lowestLandedCostSupplierId,'supplier-low');
  assert.equal(comparison.lowestLandedUnitCost,'1.00001');

  const business=buildAiBusinessContext(vault,'2026-09-19');
  const product=business.products.rows.find(row=>row.id===item.id);
  assert.ok(product);
  assert.ok(product.signals.includes('sale-price-below-cost'));
  const aiComparison=business.suppliers.itemComparisons.find(row=>row.itemId===item.id);
  assert.ok(aiComparison);
  assert.equal(aiComparison.lowestObservedSupplierId,'supplier-low');
});
