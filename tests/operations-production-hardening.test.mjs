import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { allocateLandedCost, createExpense, createManualInventoryMovement, createPurchase, createPurchaseItem, createSupplier, inventoryBalances, operationsIntegritySummary, postPurchase, purchaseTotals, reverseManualInventoryMovement, reversePurchase, spendByCurrency } from '../dist/src/lib/operations.js';
import { decimalToScaled, lineTotal } from '../dist/src/lib/money.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';

function saved(id='sku1',name='Tracked',cost='10'){
  return {id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',sku:id.toUpperCase(),descriptionEn:name,descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'20',lastCurrency:'USD',lastUnitCost:cost,lastCostCurrency:cost?'USD':'',usageCount:0,lastUsedAt:'2026-01-01T00:00:00.000Z',category:'',tags:[],favorite:false};
}

function evidencedMovement(movement,id,reasonCategory='correction'){
  const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  return {...movement,reasonCategory,createdBy:'owner',evidence:{
    id:'test-evidence-'+id,name:id+'.png',mimeType:'image/png',size:bytes.length,
    dataUrl:'data:image/png;base64,'+bytes.toString('base64'),createdAt:new Date().toISOString()
  }};
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

function allocatedLineCents(purchase){return purchase.items.reduce((sum,item)=>sum+decimalToScaled(lineTotal(item.quantity,item.landedUnitCost||item.unitCost),2),0n);}

test('concurrent posting cannot receive the same purchase into inventory twice',()=>{
  const base=draftPurchaseVault();
  const latest=applyPost(base);
  const intended=applyPost(base);
  const before=JSON.stringify({base,intended,latest});
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/posted purchases are immutable|receipts do not match|already reflected|inventory/i);
  assert.equal(JSON.stringify({base,intended,latest}),before,'a rejected duplicate posting cannot change either stock source');
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
  latest.inventoryMovements.push(evidencedMovement(reverseManualInventoryMovement(latest.inventoryMovements[0],'2026-09-02'),'rev-a'));
  intended.inventoryMovements.push(evidencedMovement(reverseManualInventoryMovement(intended.inventoryMovements[0],'2026-09-02'),'rev-b'));
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/already been reversed/i);
});

test('concurrent stock issues cannot merge into negative inventory',()=>{
  const base=emptyVault();const item=saved();base.savedItems=[item];
  base.inventoryMovements=[createManualInventoryMovement(item,'opening','10','2026-09-01','Opening')];
  const latest=structuredClone(base),intended=structuredClone(base);
  latest.inventoryMovements.push(evidencedMovement(createManualInventoryMovement(item,'issue','7','2026-09-02','Issue A'),'stock-a','samples'));
  intended.inventoryMovements.push(evidencedMovement(createManualInventoryMovement(item,'issue','7','2026-09-02','Issue B'),'stock-b','samples'));
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/cannot fall below zero|Insufficient stock at the selected warehouse/i);
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

test('landed-cost rounding reconciliation keeps allocated line costs tied to the purchase landed total',()=>{
  const supplier=createSupplier();supplier.nameEn='Supplier';
  const purchase=createPurchase([], [supplier], 'USD');
  purchase.items=Array.from({length:3},(_,index)=>{const line=createPurchaseItem();line.id=`line-${index}`;line.descriptionEn=`Item ${index+1}`;line.quantity='3';line.unitCost='1';return line;});
  purchase.freight='1.00';
  const allocated=allocateLandedCost(purchase);
  assert.equal(allocatedLineCents(allocated),decimalToScaled(purchaseTotals(purchase).landedTotal,2));
  assert.equal(decimalToScaled(purchaseTotals(purchase).landedTotal,2),1000n);
});

test('tiny landed-cost extras are not lost to per-line cent rounding when representable',()=>{
  const supplier=createSupplier();supplier.nameEn='Supplier';
  const purchase=createPurchase([], [supplier], 'USD');
  purchase.items=Array.from({length:3},(_,index)=>{const line=createPurchaseItem();line.id=`zero-${index}`;line.descriptionEn=`Zero ${index+1}`;line.quantity='1';line.unitCost='0';return line;});
  purchase.otherCosts='0.01';
  const allocated=allocateLandedCost(purchase);
  assert.equal(allocatedLineCents(allocated),1n);
});
