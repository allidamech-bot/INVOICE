import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense,createSupplier,createPurchase,createPurchaseItem,spendByCurrency,purchaseTotals} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function expense(amount='100.00'){
  return {...createExpense('USD'),id:'expense-fresh-money',date:'2026-10-01',
    description:'Commercial operating expense',amount,reference:'EXP-001'};
}
function purchase(){
  const supplier={...createSupplier(),id:'supplier-money',nameEn:'Local supplier'};
  const row={...createPurchaseItem(),id:'line-money',descriptionEn:'Replacement machine part',quantity:'1',unitCost:'25.00'};
  const doc={...createPurchase([],[supplier],'USD'),id:'purchase-fresh-money',number:'PUR-2026-0999',
    date:'2026-10-01',dueDate:'2026-10-31',items:[row]};
  return {supplier,doc};
}

test('new operating expenses cannot turn malformed thousands separators into another valid amount',()=>{
  const base=emptyVault(),before=JSON.stringify(base);
  for(const amount of ['1,2.00','12,34.56','1.2,00','١,٢.٠٠']){
    const malformed=expense(amount);
    assert.throws(()=>mergeVaultIntent(base,{...base,expenses:[malformed]},base),
      /expense.*(monetary grouping|amount format|invalid amount)/i,amount);
    assert.equal(JSON.stringify(base),before);
  }
});

test('new purchase costs, landed costs, and freight/duty charges reject malformed numeric grouping',()=>{
  const {supplier,doc}=purchase(),base={...emptyVault(),suppliers:[supplier]};
  const bad='1,2.00',fields=[
    purchase=>{purchase.items[0].unitCost=bad;},
    purchase=>{purchase.items[0].landedUnitCost=bad;},
    purchase=>{purchase.freight=bad;},
    purchase=>{purchase.duty=bad;},
    purchase=>{purchase.otherCosts=bad;}
  ];
  for(const change of fields){
    const malformed=structuredClone(doc);change(malformed);
    assert.throws(()=>mergeVaultIntent(base,{...base,purchases:[malformed]},base),
      /purchase.*(monetary grouping|invalid cost)/i);
    assert.equal(base.purchases.length,0,'invalid purchase is not persisted');
  }
});

test('valid new expense and purchase amounts retain the canonical calculation and currency grouping',()=>{
  const base=emptyVault(),legitimate=expense('1,200.00');
  const paid=mergeVaultIntent(base,{...base,expenses:[legitimate]},base);
  assert.equal(spendByCurrency([],paid.expenses)[0].expenses,'1200.00');
  const {supplier,doc}=purchase(),vault={...emptyVault(),suppliers:[supplier]};
  doc.items[0].unitCost='1,200.00';doc.freight='10.00';doc.duty='2.50';
  const saved=mergeVaultIntent(vault,{...vault,purchases:[doc]},vault);
  assert.equal(saved.purchases.length,1);
  assert.equal(purchaseTotals(saved.purchases[0]).landedTotal,'1212.50');
});

test('historical unconventional expense and purchase money remains unchanged on unrelated edits',()=>{
  const oldExpense=expense('1,2.00'),{supplier,doc}=purchase();
  const historical={...doc,items:doc.items.map(row=>({...row,unitCost:'1,2.00'})),
    freight:'1,2.00'};
  const base={...emptyVault(),suppliers:[supplier],expenses:[oldExpense],purchases:[historical]};
  const original=JSON.stringify(base);
  const unchanged=mergeVaultIntent(base,base,base);
  assert.equal(unchanged.expenses[0].amount,'1,2.00');
  assert.equal(unchanged.purchases[0].items[0].unitCost,'1,2.00');
  const intended={...base,expenses:[{...oldExpense,notes:'Reviewed legacy note'}],
    purchases:[{...historical,notes:'Reviewed legacy document'}]};
  const saved=mergeVaultIntent(base,intended,base);
  assert.equal(saved.expenses[0].amount,'1,2.00');
  assert.equal(saved.purchases[0].items[0].unitCost,'1,2.00');
  assert.equal(saved.purchases[0].freight,'1,2.00');
  assert.equal(JSON.stringify(base),original);
});
