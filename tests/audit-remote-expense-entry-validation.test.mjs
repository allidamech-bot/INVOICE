import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense,createSupplier,spendByCurrency} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function expense(id,amount='55.00'){
  return {...createExpense('USD'),id,date:'2026-10-01',description:'Freight office expenses',
    amount,reference:'EXP-001'};
}
function independentSupplier(base){
  const supplier={...createSupplier(),id:'independent-new-supplier',nameEn:'Parts Supplier'};
  return {...base,suppliers:[...base.suppliers,supplier]};
}

test('new remote expenses reject malformed monetary grouping during unrelated local supplier save',()=>{
  const base=emptyVault(),before=JSON.stringify(base);
  for(const amount of ['1,2.00','12,34.56','1.2,00','١,٢.٠٠']){
    const latest={...base,expenses:[expense('remote-expense-money',amount)]};
    assert.throws(()=>mergeVaultIntent(base,independentSupplier(base),latest),
      /expense amount.*invalid monetary grouping/i,amount);
    assert.equal(JSON.stringify(base),before);
  }
});

test('remote invalid expense dates and blank descriptions cannot enter operational history',()=>{
  const base=emptyVault();
  for(const changes of [{date:'2026-13-01'},{description:''},{amount:'0.00'},{currency:''}]){
    const remote={...expense('invalid-expense-shape'),...changes};
    assert.throws(()=>mergeVaultIntent(base,independentSupplier(base),
      {...base,expenses:[remote]}),
      /expense (date|description|amount|currency)|expense.*(required|greater)/i);
  }
});

test('distinct new remote expense records cannot collapse when they share one identifier',()=>{
  const base=emptyVault(),one=expense('new-reused-expense-id','25.00');
  const two={...expense('new-reused-expense-id','35.00'),reference:'OTHER'};
  assert.throws(()=>mergeVaultIntent(base,independentSupplier(base),
    {...base,expenses:[one,two]}),
    /new expense IDs must be unique/i);
});

test('remote edits to existing expense money still use new-money rules',()=>{
  const prior=expense('existing-expense-id','40.00');
  const base={...emptyVault(),expenses:[prior]},before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,independentSupplier(base),
    {...base,expenses:[{...prior,amount:'1,2.00',updatedAt:'2026-10-20T09:00:00.000Z'}]}),
    /expense amount.*invalid monetary grouping/i);
  assert.equal(JSON.stringify(base),before);
});

test('valid new remote expenses and local supplier changes merge without losing spend totals',()=>{
  const base=emptyVault(),remote={...base,expenses:[
    expense('remote-expense-one','1,200.00'),expense('remote-expense-two','25.00')
  ]};
  const merged=mergeVaultIntent(base,independentSupplier(base),remote);
  assert.equal(merged.expenses.length,2);
  assert.equal(merged.suppliers.length,1);
  assert.equal(spendByCurrency([],merged.expenses)[0].expenses,'1225.00');
});

test('unchanged legacy expense amount survives remote reference edits and unrelated local work',()=>{
  const prior=expense('legacy-expense-amount','1,2.00');
  const base={...emptyVault(),expenses:[prior]},before=JSON.stringify(base);
  const latest=structuredClone(base);
  latest.expenses[0].reference='REF-UPDATED-LEGACY';
  const merged=mergeVaultIntent(base,independentSupplier(base),latest);
  assert.equal(merged.expenses[0].amount,'1,2.00');
  assert.equal(merged.expenses[0].reference,'REF-UPDATED-LEGACY');
  assert.equal(JSON.stringify(base),before);
});
