import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense,createSupplier,createPurchase,createPurchaseItem,postPurchase,purchaseTotals} from '../dist/src/lib/operations.js';
import {supplierPayablesByCurrency} from '../dist/src/lib/payables.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const supplier={...createSupplier(),id:'supplier-remote-purchase-verify',
    nameEn:'International Service Provider'};
  const vault={...emptyVault(),suppliers:[supplier]};
  const draft={...createPurchase([],[supplier],'USD'),
    id:'remote-purchase-entry',number:'PUR-REMOTE-2026-01',
    date:'2026-10-01',dueDate:'2026-11-01',
    items:[{...createPurchaseItem(),id:'remote-service-line',savedItemId:'',
      descriptionEn:'Inspection and handling service',quantity:'1',unitCost:'120.00'}]};
  return {vault,draft,supplier};
}
const unrelatedExpense=base=>({...base,expenses:[{...createExpense('USD'),
  id:'independent-purchase-review-expense',description:'Bank fees',amount:'5.00'}]});

test('remote new purchase service costs cannot enter payables with malformed monetary grouping',()=>{
  const {vault,draft}=fixture(),before=JSON.stringify(vault);
  for(const amount of ['1,2.00','12,34.56','1.2,00']){
    const remote={...draft,items:[{...draft.items[0],unitCost:amount}]};
    assert.throws(()=>mergeVaultIntent(vault,unrelatedExpense(vault),
      {...vault,purchases:[remote]}),/purchase unit cost.*invalid monetary grouping/i);
    assert.equal(JSON.stringify(vault),before);
  }
});

test('remote new purchase freight/duty/landed costs must use valid grouping too',()=>{
  const {vault,draft}=fixture();
  for(const changed of [
    {...draft,freight:'1,2.00'},
    {...draft,duty:'1,2.00'},
    {...draft,otherCosts:'1,2.00'},
    {...draft,items:[{...draft.items[0],landedUnitCost:'1,2.00'}]}
  ]){
    assert.throws(()=>mergeVaultIntent(vault,unrelatedExpense(vault),
      {...vault,purchases:[changed]}),
      /purchase (charge|unit cost).*invalid monetary grouping/i);
  }
});

test('remote invalid purchase dates, missing supplier or duplicate purchase number cannot save',()=>{
  const {vault,draft}=fixture();
  for(const changed of [
    {...draft,dueDate:'2026-09-30'},
    {...draft,supplierSnapshot:{...draft.supplierSnapshot,sourceSupplierId:''}},
    {...draft,items:[]}
  ])assert.throws(()=>mergeVaultIntent(vault,unrelatedExpense(vault),
    {...vault,purchases:[changed]}),/purchase|supplier|at least one purchase item/i);
  const existing={...draft,id:'existing-purchase-unique'};
  const current={...vault,purchases:[existing]};
  assert.throws(()=>mergeVaultIntent(current,unrelatedExpense(current),
    {...current,purchases:[existing,{...draft,id:'duplicate-purchase-number'}]}),
    /purchase number already exists/i);
});

test('two new remote purchase rows cannot collapse into one with a repeated ID',()=>{
  const {vault,draft}=fixture();
  assert.throws(()=>mergeVaultIntent(vault,unrelatedExpense(vault),
    {...vault,purchases:[draft,{...draft,items:[{...draft.items[0],unitCost:'45.00'}]}]}),
    /new purchase IDs must be unique/i);
});

test('legitimate remote posted service purchase and independent expense preserve exact payable and spending',()=>{
  const {vault,draft}=fixture();
  const posted=postPurchase(draft,[],[]).purchase;
  const merged=mergeVaultIntent(vault,unrelatedExpense(vault),
    {...vault,purchases:[posted]});
  assert.equal(merged.purchases.length,1);
  assert.equal(merged.purchases[0].status,'posted');
  assert.equal(merged.expenses.length,1);
  assert.equal(purchaseTotals(merged.purchases[0]).landedTotal,'120.00');
  assert.equal(supplierPayablesByCurrency(merged.purchases,[],'2026-10-20')[0].remaining,'120.00');
});

test('old purchase line numeric spellings remain unchanged after remote notes-only update',()=>{
  const {vault,draft}=fixture();
  const historical={...vault,purchases:[{...draft,items:[{...draft.items[0],
    unitCost:'1,2.00'}]}]},before=JSON.stringify(historical);
  const remote=structuredClone(historical);
  remote.purchases[0].notes='Recorded note from supplier audit';
  const merged=mergeVaultIntent(historical,unrelatedExpense(historical),remote);
  assert.equal(merged.purchases[0].items[0].unitCost,'1,2.00');
  assert.equal(merged.purchases[0].notes,'Recorded note from supplier audit');
  assert.equal(JSON.stringify(historical),before);
});
