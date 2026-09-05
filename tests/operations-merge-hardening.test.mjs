import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createExpense, createManualInventoryMovement, createPurchase, createPurchaseItem, postPurchase, reverseManualInventoryMovement, reversePurchase } from '../dist/src/lib/operations.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';

function supplier(id='supplier-a'){
  const at='2026-09-05T12:00:00.000Z';
  return{id,createdAt:at,updatedAt:at,nameEn:'Supplier A',nameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',defaultCurrency:'USD',paymentTerms:'',notes:''};
}
function savedItem(id='item-a'){
  const at='2026-09-05T12:00:00.000Z';
  return{id,createdAt:at,updatedAt:at,sku:'SKU-A',descriptionEn:'Material A',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'',lastCurrency:'USD',lastUnitCost:'5.00',lastCostCurrency:'USD',usageCount:0,lastUsedAt:at,category:'',tags:[],favorite:false};
}
function purchaseFor(base,{id='purchase-a',number='PUR-2026-0001'}={}){
  const purchase=createPurchase(base.purchases,base.suppliers,'USD');
  purchase.id=id;purchase.number=number;purchase.date='2026-09-05';
  const line=createPurchaseItem(base.savedItems[0]);line.id=`line-${id}`;line.quantity='5';line.unitCost='10.00';
  purchase.items=[line];purchase.freight='5.00';
  return purchase;
}
function postedBase(){
  const base=emptyVault();base.suppliers=[supplier()];base.savedItems=[savedItem()];
  const draft=purchaseFor(base);base.purchases=[draft];
  const posted=postPurchase(draft,base.savedItems,base.inventoryMovements);
  return {...base,purchases:[posted.purchase],inventoryMovements:posted.movements,savedItems:posted.savedItems};
}

test('concurrent purchase posting cannot double inventory receipts',()=>{
  const base=emptyVault();base.suppliers=[supplier()];base.savedItems=[savedItem()];
  const draft=purchaseFor(base);base.purchases=[draft];
  const first=postPurchase(draft,base.savedItems,base.inventoryMovements);
  const latest=mergeVaultIntent(base,{...base,purchases:[first.purchase],inventoryMovements:first.movements,savedItems:first.savedItems},base);
  assert.equal(latest.inventoryMovements.filter(m=>m.type==='purchase').length,1);
  const second=postPurchase(draft,base.savedItems,base.inventoryMovements);
  assert.throws(()=>mergeVaultIntent(base,{...base,purchases:[second.purchase],inventoryMovements:second.movements,savedItems:second.savedItems},latest),/receipt history is inconsistent/i);
});

test('concurrent purchase reversal cannot duplicate stock reversal',()=>{
  const base=postedBase();const purchase=base.purchases[0];
  const first=reversePurchase(purchase,'First reversal',base.inventoryMovements,base.savedItems);
  const latest=mergeVaultIntent(base,{...base,purchases:[first.purchase],inventoryMovements:[...base.inventoryMovements,...first.movements],savedItems:first.savedItems},base);
  assert.equal(latest.inventoryMovements.filter(m=>m.type==='purchase-reversal').length,1);
  const second=reversePurchase(purchase,'Second reversal',base.inventoryMovements,base.savedItems);
  assert.throws(()=>mergeVaultIntent(base,{...base,purchases:[second.purchase],inventoryMovements:[...base.inventoryMovements,...second.movements],savedItems:second.savedItems},latest),/reversal history is inconsistent/i);
});

test('the same manual inventory movement cannot be reversed on two devices',()=>{
  const base=emptyVault();const item=savedItem();base.savedItems=[item];
  const original=createManualInventoryMovement(item,'opening','10','2026-09-05','Opening');base.inventoryMovements=[original];
  const first=reverseManualInventoryMovement(original,'2026-09-05');
  const latest=mergeVaultIntent(base,{...base,inventoryMovements:[original,first]},base);
  const second=reverseManualInventoryMovement(original,'2026-09-05');
  assert.throws(()=>mergeVaultIntent(base,{...base,inventoryMovements:[original,second]},latest),/already been reversed on another device/i);
});

test('supplier deletion cannot orphan an expense added concurrently',()=>{
  const base=emptyVault();const source=supplier();base.suppliers=[source];
  const expense=createExpense('USD');expense.id='expense-a';expense.date='2026-09-05';expense.description='Freight handling';expense.amount='25.00';expense.supplierId=source.id;
  const latest=mergeVaultIntent(base,{...base,expenses:[expense]},base);
  assert.equal(latest.expenses.length,1);
  assert.throws(()=>mergeVaultIntent(base,{...base,suppliers:[]},latest),/still referenced by an expense/i);
});

test('concurrent purchase drafts cannot reserve the same purchase number',()=>{
  const base=emptyVault();base.suppliers=[supplier()];base.savedItems=[savedItem()];
  const first=purchaseFor(base,{id:'purchase-one'});const second=purchaseFor(base,{id:'purchase-two'});
  assert.equal(first.number,second.number);
  const latest=mergeVaultIntent(base,{...base,purchases:[first]},base);
  assert.throws(()=>mergeVaultIntent(base,{...base,purchases:[second]},latest),/purchase number already exists/i);
});

test('saved item deletion cannot erase an item that gained purchase history concurrently',()=>{
  const base=emptyVault();base.suppliers=[supplier()];base.savedItems=[savedItem()];
  const purchase=purchaseFor(base,{id:'purchase-new'});
  const posted=postPurchase(purchase,base.savedItems,base.inventoryMovements);
  const latest=mergeVaultIntent(base,{...base,purchases:[posted.purchase],inventoryMovements:posted.movements,savedItems:posted.savedItems},base);
  assert.throws(()=>mergeVaultIntent(base,{...base,savedItems:[]},latest),/gained purchase or inventory history/i);
});

test('inventory ledger entries are append-only after they are recorded',()=>{
  const base=emptyVault();const item=savedItem();base.savedItems=[item];
  const movement=createManualInventoryMovement(item,'opening','10','2026-09-05');base.inventoryMovements=[movement];
  assert.throws(()=>mergeVaultIntent(base,{...base,inventoryMovements:[]},base),/append-only/i);
  const edited={...movement,quantity:'20'};
  assert.throws(()=>mergeVaultIntent(base,{...base,inventoryMovements:[edited]},base),/read-only/i);
});
