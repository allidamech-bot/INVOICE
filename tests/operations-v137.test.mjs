import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault, APP_SCHEMA_VERSION } from '../dist/src/lib/defaults.js';
import { migrateVault } from '../dist/src/storage/vault.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';
import { allocateLandedCost, createExpense, createManualInventoryMovement, createPurchase, createPurchaseItem, createSupplier, inventoryBalances, postPurchase, purchaseTotals, reversePurchase, spendByCurrency, validateExpense } from '../dist/src/lib/operations.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

function saved(id,name,cost=''){
  return {id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',sku:id.toUpperCase(),descriptionEn:name,descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'20',lastCurrency:'USD',lastUnitCost:cost,lastCostCurrency:cost?'USD':'',usageCount:0,lastUsedAt:'2026-01-01T00:00:00.000Z',category:'',tags:[],favorite:false};
}

function purchaseFixture(){
  const supplier=createSupplier();supplier.nameEn='Supplier A';
  const items=[saved('a','A','10'),saved('b','B','20')];
  const purchase=createPurchase([], [supplier], 'USD');
  purchase.items=[createPurchaseItem(items[0]),createPurchaseItem(items[1])];
  purchase.items[0].quantity='10';purchase.items[0].unitCost='10';
  purchase.items[1].quantity='10';purchase.items[1].unitCost='20';
  purchase.freight='30';purchase.duty='0';purchase.otherCosts='0';
  return {supplier,items,purchase};
}

test('v137 migrates legacy vaults to first-class encrypted operations collections',()=>{
  const legacy=emptyVault();legacy.schemaVersion=10;
  delete legacy.suppliers;delete legacy.purchases;delete legacy.expenses;delete legacy.inventoryMovements;
  const migrated=migrateVault(legacy);
  assert.equal(APP_SCHEMA_VERSION,11);
  assert.equal(migrated.schemaVersion,11);
  assert.deepEqual(migrated.suppliers,[]);assert.deepEqual(migrated.purchases,[]);assert.deepEqual(migrated.expenses,[]);assert.deepEqual(migrated.inventoryMovements,[]);
});

test('v137 merge keeps independent supplier purchase expense and stock writes',()=>{
  const base=emptyVault();
  const intended=structuredClone(base);const latest=structuredClone(base);
  const supplier=createSupplier();supplier.nameEn='A';intended.suppliers=[supplier];
  const expense=createExpense('USD');expense.description='Freight';expense.amount='50';latest.expenses=[expense];
  const merged=mergeVaultIntent(base,intended,latest);
  assert.equal(merged.suppliers.length,1);assert.equal(merged.expenses.length,1);
});

test('v137 landed cost allocation is value-weighted and fixed-precision',()=>{
  const {purchase}=purchaseFixture();
  const allocated=allocateLandedCost(purchase);
  assert.equal(allocated.items[0].landedUnitCost,'11.0000');
  assert.equal(allocated.items[1].landedUnitCost,'22.0000');
  const totals=purchaseTotals(allocated);
  assert.equal(totals.subtotal,'300.00');assert.equal(totals.landedTotal,'330.00');
});

test('v137 posting purchase creates auditable receipts and updates reusable landed unit cost',()=>{
  const {items,purchase}=purchaseFixture();
  const posted=postPurchase(purchase,items,[]);
  assert.equal(posted.purchase.status,'posted');
  assert.equal(posted.movements.length,2);
  assert.equal(posted.movements[0].type,'purchase');
  assert.equal(posted.movements[0].quantity,'10');
  assert.equal(posted.savedItems.find(i=>i.id==='a').lastUnitCost,'11.0000');
  assert.equal(posted.savedItems.find(i=>i.id==='b').lastUnitCost,'22.0000');
});

test('v137 purchase reversal appends negative stock movements instead of deleting history',()=>{
  const {items,purchase}=purchaseFixture();
  const posted=postPurchase(purchase,items,[]);
  const reversed=reversePurchase(posted.purchase,'Supplier invoice cancelled',posted.movements);
  assert.equal(reversed.purchase.status,'reversed');
  assert.equal(reversed.movements.length,2);
  assert.equal(reversed.movements[0].type,'purchase-reversal');
  assert.equal(reversed.movements[0].quantity,'-10');
  const balances=inventoryBalances(posted.savedItems,[...posted.movements,...reversed.movements]);
  assert.equal(balances.find(row=>row.item.id==='a').quantity,'0');
  assert.equal(balances.find(row=>row.item.id==='b').quantity,'0');
});

test('v137 inventory only changes through explicit ledger movements',()=>{
  const item=saved('sku1','Tracked');
  const opening=createManualInventoryMovement(item,'opening','25','2026-09-01','Opening');
  const issue=createManualInventoryMovement(item,'issue','4','2026-09-02','Manual issue');
  const adjust=createManualInventoryMovement(item,'adjustment','-1','2026-09-02','Count correction');
  assert.equal(inventoryBalances([item],[opening,issue,adjust])[0].quantity,'20');
  assert.equal(issue.quantity,'-4');
});

test('v137 operating expenses remain separate and currencies are never combined',()=>{
  const {items,purchase}=purchaseFixture();const posted=postPurchase(purchase,items,[]).purchase;
  const usd=createExpense('USD');usd.description='Warehouse';usd.amount='20';assert.deepEqual(validateExpense(usd),[]);
  const eur=createExpense('EUR');eur.description='Bank fee';eur.amount='5';
  const spend=spendByCurrency([posted],[usd,eur]);
  assert.deepEqual(spend.map(row=>row.currency),['EUR','USD']);
  assert.equal(spend.find(row=>row.currency==='USD').total,'350.00');
  assert.equal(spend.find(row=>row.currency==='EUR').total,'5.00');
});

test('v137 UI and PWA expose one compact Operations workspace offline',async()=>{
  const [app,page,index,sw]=await Promise.all([read('src/app/App.tsx'),read('src/components/OperationsPage.tsx'),read('index.html'),read('public/sw.js')]);
  assert.match(app,/screen:'documents'\|'customers'\|'receivables'\|'reports'\|'items'\|'operations'\|'editor'/);
  assert.match(app,/OperationsPage/);assert.match(page,/Suppliers/);assert.match(page,/Purchases/);assert.match(page,/Expenses/);assert.match(page,/Inventory Ledger/);
  const css='./styles/operations-v137.css',performance='./styles/performance-polish-v100.css';
  assert.ok(index.includes(css));assert.ok(index.indexOf(css)<index.indexOf(performance));
  for(const asset of [css,'./src/components/OperationsPage.js','./src/lib/operations.js'])assert.ok(sw.includes(asset),asset);
  assert.match(sw,/const CACHE = 'lourex-invoice-v137'/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v136'/);
});
