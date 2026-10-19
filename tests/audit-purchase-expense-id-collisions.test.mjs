import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense,createSupplier,createPurchase,createPurchaseItem,spendByCurrency} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function expenses(){
  const base=emptyVault();
  const first={...createExpense('USD'),id:'new-expense-same-id',date:'2026-10-01',
    description:'Warehouse rent',amount:'125.00',reference:'RENT-1'};
  return {base,first,second:{...first,description:'Insurance premium',amount:'75.00',reference:'INS-2'}};
}
function purchases(){
  const supplier={...createSupplier(),nameEn:'Warehouse Supplier'};
  const first=createPurchase([],[supplier],'USD');
  first.id='new-purchase-same-id';first.date='2026-10-01';first.dueDate='2026-11-01';
  first.items=[{...createPurchaseItem(),descriptionEn:'Office equipment',quantity:'2',unitCost:'80.00'}];
  const second={...structuredClone(first),notes:'Another legitimate purchase order',number:'PUR-2026-0099'};
  const base={...emptyVault(),suppliers:[supplier]};
  return {base,first,second};
}

test('two fresh operating expenses with the same ID cannot silently collapse into one expense',()=>{
  const {base,first,second}=expenses(),original=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,expenses:[first,second]},base),
    /expense.*(unique|duplicate)/i);
  assert.equal(JSON.stringify(base),original,'rejected expense batch cannot mutate persisted source state');
});

test('two fresh purchase drafts sharing an ID cannot silently drop one purchase obligation',()=>{
  const {base,first,second}=purchases(),original=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,purchases:[first,second]},base),
    /purchase.*(unique|duplicate)/i);
  assert.equal(JSON.stringify(base),original,'rejected purchase batch cannot rewrite saved purchases');
});

test('distinct purchases and expenses preserve both records and currency-separated operating spend',()=>{
  const {base,first,second}=expenses();
  const valid={...second,id:'new-expense-distinct-id',currency:'EUR'};
  const merged=mergeVaultIntent(base,{...base,expenses:[first,valid]},base);
  assert.equal(merged.expenses.length,2);
  assert.deepEqual(spendByCurrency([],merged.expenses).map(row=>[row.currency,row.expenses]),[['EUR','75.00'],['USD','125.00']]);
  const purchase=purchases(),other={...purchase.second,id:'new-purchase-distinct-id'};
  const withPurchases=mergeVaultIntent(purchase.base,{...purchase.base,purchases:[purchase.first,other]},purchase.base);
  assert.equal(withPurchases.purchases.length,2);
  assert.equal(withPurchases.purchases[0].id,purchase.first.id);
});

test('unchanged legacy operating record IDs and amounts remain byte-for-byte preserved',()=>{
  const {base,first}=expenses();
  const historic={...base,expenses:[{...first,amount:'1,2.00'}]};
  const prior=JSON.stringify(historic);
  const merged=mergeVaultIntent(historic,historic,historic);
  assert.equal(merged.expenses[0].amount,'1,2.00');
  assert.equal(JSON.stringify(historic),prior);
});
