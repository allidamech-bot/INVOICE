import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createPurchase, createPurchaseItem, createSupplier } from '../dist/src/lib/operations.js';
import { buildProcurementDraftContext } from '../dist/src/lib/procurement-ai.js';

function supplier(id,name){const row=createSupplier();row.id=id;row.nameEn=name;return row;}
function offer(id,number,supplierRow,{sku='',description='Premium Coffee Beans',cost='10.00'}={}){
  const purchase=createPurchase([], [supplierRow], 'USD');purchase.id=id;purchase.number=number;purchase.status='draft';purchase.currency='USD';purchase.freight='1.00';purchase.duty='1.00';purchase.otherCosts='1.00';
  const line=createPurchaseItem();line.savedItemId='';line.sku=sku;line.descriptionEn=description;line.descriptionAr='';line.quantity='1';line.unit='BOX';line.unitCost=cost;purchase.items=[line];return purchase;
}

test('v450 procurement remembers the first explicit identifier attached to a fuzzy name group',()=>{
  const vault=emptyVault();const a=supplier('supplier-a','Supplier A'),b=supplier('supplier-b','Supplier B'),c=supplier('supplier-c','Supplier C');vault.suppliers=[a,b,c];
  vault.purchases=[
    offer('offer-name','OFFER-NAME',a,{cost:'12.00'}),
    offer('offer-sku-a','OFFER-A',b,{sku:'SKU-A',cost:'10.00'}),
    offer('offer-sku-b','OFFER-B',c,{sku:'SKU-B',cost:'8.00'})
  ];
  const context=buildProcurementDraftContext(vault);
  assert.equal(context.comparisons.length,1);
  const comparison=context.comparisons[0];
  assert.equal(comparison.offers.length,2);
  assert.deepEqual(new Set(comparison.offers.map(row=>row.purchaseId)),new Set(['offer-name','offer-sku-a']));
  assert.equal(comparison.offers.some(row=>row.purchaseId==='offer-sku-b'),false);
  assert.equal(comparison.lowestUnitCostPurchaseId,'offer-sku-a');
});

test('v450 procurement never fuzzy-merges two different explicit SKUs just because descriptions match',()=>{
  const vault=emptyVault();const a=supplier('supplier-a','Supplier A'),b=supplier('supplier-b','Supplier B');vault.suppliers=[a,b];
  vault.purchases=[offer('offer-a','OFFER-A',a,{sku:'SKU-A',cost:'10.00'}),offer('offer-b','OFFER-B',b,{sku:'SKU-B',cost:'8.00'})];
  const context=buildProcurementDraftContext(vault);
  assert.equal(context.comparisons.length,0);
});
