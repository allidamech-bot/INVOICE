import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createExpense, createManualInventoryMovement, createPurchase, createPurchaseItem, createSupplier, inventoryBalances, operationsIntegritySummary, postPurchase, reverseManualInventoryMovement, reversePurchase, spendByCurrency } from '../dist/src/lib/operations.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';

function saved(id='sku1',name='Tracked',cost='10'){
  return {id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',sku:id.toUpperCase(),descriptionEn:name,descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'20',lastCurrency:'USD',lastUnitCost:cost,lastCostCurrency:cost?'USD':'',usageCount:0,lastUsedAt:'2026-01-01T00:00:00.000Z',category:'',tags:[],favorite:false};
}

function draftPurchaseVault(){
  const vault=emptyVault();
  const supplier=createSupplier();supplier.nameEn='Supplier A';
  const item=saved();
  const purchase=createPurchase([], [supplier], 'USD');
  purchase.items=[createPurchaseItem(item)];
  purchase.items[0].quantity='10';purchase.items[0].unitCost='10';
  vault.suppliers=[supplier];vault.savedItems=[item];vault.purchases=[purchase];
  return vault;
}

function postedPurchaseVault(){
  const vault=draftPurchaseVault();
  const posted=postPurchase(vault.purchases[0],vault.savedItems,[]);
  vault.purchases=[posted.purchase];vault.savedItems=posted.savedItems;vault.inventoryMovements=posted.movements;
  return vault;
}

function applyPost(vault){
  const next=structuredClone(vault);
  const posted=postPurchase(next.purchases[0],next.savedItems,next.inventoryMovements);
  next.purchases=[posted.purchase];next.savedItems=posted.savedItems;next.inventoryMovements=[...next.inventoryMovements,...posted.movements];
  return next;
}

function applyPurchaseReverse(vault,reason){
  const next=structuredClone(vault);
  const reversed=reversePurchase(next.purchases[0],reason,next.inventoryMovements,next.savedItems);
  next.purchases=[reversed.purchase];next.savedItems=reversed.savedItems;next.inventoryMovements=[...next.inventoryMovements,...reversed.movements];
  return next;
}

test('concurrent posting cannot receive the same purchase into inventory twice',()=>{
  const base=draftPurchaseVault();
  const latest=applyPost(base);
  const intended=applyPost(base);
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/receipts do not match|already reflected|inventory/i);
});

test('concurrent purchase reversal cannot subtract the same stock twice',()=>{
  const base=postedPurchaseVault();
  const latest=applyPurchaseReverse(base,'Device A reversal');
  const intended=applyPurchaseReverse(base,'Device B reversal');
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/reversal stock does not exactly offset|inventory cannot fall below zero|reversed/i);
});

test('concurrent reversal of one manual movement is rejected instead of double reversing stock',()=>{
  const base=emptyVault();const item=saved();base.savedItems=[item];
  const opening=createManualInventoryMovement(item,'opening','10','2026-09-01','Opening');base.inventoryMovements=[opening];
  const latest=structuredClone(base),intended=structuredClone(base);
  latest.inventoryMovements.push(reverseManualInventoryMovement(latest.inventoryMovements[0],'2026-09-02'));
  intended.inventoryMovements.push(reverseManualInventoryMovement(intended.inventoryMovements[0],'2026-09-02'));
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/already been reversed/i);
});

test('concurrent stock issues cannot merge into negative inventory',()=>{
  const base=emptyVault();const item=saved();base.savedItems=[item];
  base.inventoryMovements=[createManualInventoryMovement(item,'opening','10','2026-09-01','Opening')];
  const latest=structuredClone(base),intended=structuredClone(base);
  latest.inventoryMovements.push(createManualInventoryMovement(item,'issue','7','2026-09-02','Issue A'));
  intended.inventoryMovements.push(createManualInventoryMovement(item,'issue','7','2026-09-02','Issue B'));
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/cannot fall below zero/i);
});

test('concurrent purchases cannot commit the same purchase number twice',()=>{
  const base=emptyVault();const supplier=createSupplier();supplier.nameEn='Supplier';const item=saved();base.suppliers=[supplier];base.savedItems=[item];
  const latest=structuredClone(base),intended=structuredClone(base);
  const first=createPurchase([],latest.suppliers,'USD');first.items=[createPurchaseItem(latest.savedItems[0])];first.items[0].unitCost='10';
  const second=createPurchase([],intended.suppliers,'USD');second.items=[createPurchaseItem(intended.savedItems[0])];second.items[0].unitCost='10';
  latest.purchases=[first];intended.purchases=[second];
  assert.equal(first.number,second.number);
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/Purchase number already exists/i);
});

test('saved items with a non-zero inventory balance cannot disappear from the inventory master',()=>{
  const base=emptyVault();const item=saved();base.savedItems=[item];base.inventoryMovements=[createManualInventoryMovement(item,'opening','5','2026-09-01','Opening')];
  const intended=structuredClone(base),latest=structuredClone(base);intended.savedItems=[];
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/still has an inventory balance/i);
});

test('posted purchases are immutable and must be reversed instead of edited',()=>{
  const base=postedPurchaseVault();const intended=structuredClone(base),latest=structuredClone(base);
  intended.purchases[0].notes='Edited after posting';intended.purchases[0].updatedAt='2026-09-05T20:00:00.000Z';
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/Posted purchases are immutable/i);
});

test('new invalid operating expenses cannot bypass UI validation at the persistence boundary',()=>{
  const base=emptyVault(),latest=structuredClone(base),intended=structuredClone(base);
  const expense=createExpense('USD');expense.description='Invalid';expense.amount='-5';intended.expenses=[expense];
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/amount must be greater than zero/i);
});

test('malformed historical purchases and expenses are excluded from spend instead of silently becoming zero',()=>{
  const vault=postedPurchaseVault();
  const validExpense=createExpense('USD');validExpense.description='Valid';validExpense.amount='20';
  const invalidExpense={...createExpense('USD'),description:'Legacy malformed',amount:'not-a-number'};
  const invalidPurchase=structuredClone(vault.purchases[0]);invalidPurchase.id='legacy-purchase';invalidPurchase.number='PUR-2026-9999';invalidPurchase.items[0].unitCost='bad-cost';
  const spend=spendByCurrency([vault.purchases[0],invalidPurchase],[validExpense,invalidExpense]);
  assert.deepEqual(spend.map(row=>row.currency),['USD']);
  assert.equal(spend[0].purchases,'100.00');
  assert.equal(spend[0].expenses,'20.00');
  assert.equal(spend[0].total,'120.00');
  const integrity=operationsIntegritySummary([vault.purchases[0],invalidPurchase],[validExpense,invalidExpense],[]);
  assert.equal(integrity.invalidPurchases,1);
  assert.equal(integrity.invalidExpenses,1);
  assert.equal(integrity.totalInvalid,2);
});

test('malformed historical inventory movements stay in history but do not alter on-hand quantity',()=>{
  const item=saved();
  const valid=createManualInventoryMovement(item,'opening','10','2026-09-01','Opening');
  const invalid={...valid,id:'legacy-bad-stock',quantity:'broken'};
  const invalidSign={...valid,id:'legacy-bad-sign',type:'issue',quantity:'5'};
  const balances=inventoryBalances([item],[valid,invalid,invalidSign]);
  assert.equal(balances[0].quantity,'10');
  const integrity=operationsIntegritySummary([],[],[valid,invalid,invalidSign]);
  assert.equal(integrity.invalidMovements,2);
  assert.equal(integrity.totalInvalid,2);
});
