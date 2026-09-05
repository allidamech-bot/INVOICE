import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createExpense, createPurchase, createPurchaseItem, createSupplier } from '../dist/src/lib/operations.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';

function saved(id='sku1'){
  return {id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',sku:id.toUpperCase(),descriptionEn:'Tracked',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'20',lastCurrency:'USD',lastUnitCost:'10',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'2026-01-01T00:00:00.000Z',category:'',tags:[],favorite:false};
}

function supplierVault(){
  const base=emptyVault();const supplier=createSupplier();supplier.nameEn='Supplier A';base.suppliers=[supplier];return base;
}
function expenseVault(){
  const base=emptyVault();const expense=createExpense('USD');expense.description='Warehouse';expense.amount='50';base.expenses=[expense];return base;
}
function purchaseVault(){
  const base=emptyVault();const supplier=createSupplier();supplier.nameEn='Supplier A';const item=saved();
  const purchase=createPurchase([], [supplier], 'USD');purchase.items=[createPurchaseItem(item)];purchase.items[0].unitCost='10';
  base.suppliers=[supplier];base.savedItems=[item];base.purchases=[purchase];return base;
}

test('stale supplier delete cannot erase a supplier edited on another device',()=>{
  const base=supplierVault(),intended=structuredClone(base),latest=structuredClone(base);
  intended.suppliers=[];latest.suppliers[0].phone='555-0101';latest.suppliers[0].updatedAt='2026-09-05T20:35:00.000Z';
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/Supplier changed on another device/i);
});

test('two concurrent edits to the same supplier require a fresh reopen',()=>{
  const base=supplierVault(),intended=structuredClone(base),latest=structuredClone(base);
  intended.suppliers[0].phone='111';latest.suppliers[0].phone='222';
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/Supplier changed on another device/i);
});

test('stale expense delete cannot erase an expense edited on another device',()=>{
  const base=expenseVault(),intended=structuredClone(base),latest=structuredClone(base);
  intended.expenses=[];latest.expenses[0].amount='75';latest.expenses[0].updatedAt='2026-09-05T20:35:00.000Z';
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/Expense changed on another device/i);
});

test('two concurrent edits to the same expense do not silently overwrite each other',()=>{
  const base=expenseVault(),intended=structuredClone(base),latest=structuredClone(base);
  intended.expenses[0].amount='60';latest.expenses[0].amount='70';
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/Expense changed on another device/i);
});

test('stale draft purchase delete cannot erase a concurrently edited draft',()=>{
  const base=purchaseVault(),intended=structuredClone(base),latest=structuredClone(base);
  intended.purchases=[];latest.purchases[0].notes='Updated on device B';latest.purchases[0].updatedAt='2026-09-05T20:35:00.000Z';
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/Purchase changed on another device/i);
});

test('two concurrent edits to the same draft purchase require a fresh reopen',()=>{
  const base=purchaseVault(),intended=structuredClone(base),latest=structuredClone(base);
  intended.purchases[0].notes='Device A';latest.purchases[0].notes='Device B';
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/Purchase changed on another device/i);
});

test('independent operations edits still merge without false conflicts',()=>{
  const base=emptyVault();
  const supplier=createSupplier();supplier.nameEn='Supplier A';base.suppliers=[supplier];
  const expense=createExpense('USD');expense.description='Warehouse';expense.amount='50';base.expenses=[expense];
  const intended=structuredClone(base),latest=structuredClone(base);
  intended.suppliers[0].phone='111';
  latest.expenses[0].amount='75';
  const merged=mergeVaultIntent(base,intended,latest);
  assert.equal(merged.suppliers[0].phone,'111');
  assert.equal(merged.expenses[0].amount,'75');
});
