import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateLandedCost, createPurchase, createPurchaseItem, createSupplier, postPurchase, purchaseTotals, validatePurchase } from '../dist/src/lib/operations.js';
import { decimalToScaled } from '../dist/src/lib/money.js';

const PRODUCT_TO_CENTS=100_000_000_000_000n;
function roundDivide(value,divisor){const sign=(value<0n)!==(divisor<0n)?-1n:1n;const a=value<0n?-value:value;const b=divisor<0n?-divisor:divisor;return ((a+b/2n)/b)*sign;}
function landedLineCents(quantity,unitCost){return roundDivide(decimalToScaled(quantity,4)*decimalToScaled(unitCost,12),PRODUCT_TO_CENTS);}
function savedItem(id='precision-item'){return{id,createdAt:'2026-09-19T00:00:00.000Z',updatedAt:'2026-09-19T00:00:00.000Z',sku:'PRECISION',descriptionEn:'Precision item',descriptionAr:'صنف دقة',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'2.00',lastCurrency:'USD',lastUnitCost:'1.00',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'',category:'',tags:[],favorite:false};}
function purchaseFor(quantity,freight){const item=savedItem();const supplier=createSupplier();supplier.id='precision-supplier';supplier.nameEn='Precision Supplier';const purchase=createPurchase([], [supplier], 'USD');purchase.items=[createPurchaseItem(item)];purchase.items[0].quantity=quantity;purchase.items[0].unitCost='1.00';purchase.freight=freight;return{item,purchase};}

test('v266 landed cost uses extra precision when four decimals cannot represent one cent exactly',()=>{
  const {item,purchase}=purchaseFor('1000','0.01');
  const allocated=allocateLandedCost(purchase);
  assert.equal(allocated.items[0].landedUnitCost,'1.00001');
  const target=decimalToScaled(purchaseTotals(purchase).landedTotal,2);
  assert.equal(target,100001n);
  assert.equal(landedLineCents(allocated.items[0].quantity,allocated.items[0].landedUnitCost),target);

  const posted=postPurchase(purchase,[item],[]);
  assert.equal(posted.purchase.items[0].landedUnitCost,'1.00001');
  assert.equal(posted.movements[0].unitCost,'1.00001');
  assert.equal(posted.savedItems[0].lastUnitCost,'1.00001');
});

test('v266 ordinary landed costs keep the established four-decimal representation',()=>{
  const {purchase}=purchaseFor('10','10.00');
  const allocated=allocateLandedCost(purchase);
  assert.equal(allocated.items[0].landedUnitCost,'2.0000');
});

test('v266 posting refuses an unrepresentable landed allocation instead of storing silent drift',()=>{
  const {item,purchase}=purchaseFor('100000000000','0.01');
  const allocated=allocateLandedCost(purchase);
  const target=decimalToScaled(purchaseTotals(purchase).landedTotal,2);
  const actual=landedLineCents(allocated.items[0].quantity,allocated.items[0].landedUnitCost);
  assert.notEqual(actual,target);
  assert.throws(()=>postPurchase(purchase,[item],[]),/cannot be represented exactly/);
});

test('v266 purchase validation rejects negative micro-costs that four-decimal rounding used to hide',()=>{
  const {item,purchase}=purchaseFor('1','0.00');
  purchase.items[0].unitCost='-0.00001';
  assert.ok(validatePurchase(purchase,[item]).some(error=>error.includes('unit cost must be zero or greater')));
});
