import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createPurchase,createPurchaseItem,createSupplier,postPurchase,reversePurchase,createExpense} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {supplierPayablesByCurrency} from '../dist/src/lib/payables.js';

function fixture(){
  const supplier={...createSupplier(),id:'supplier-untracked-service',nameEn:'Service Provider'};
  const draft=createPurchase([],[supplier],'USD');
  draft.id='purchase-untracked-service';
  draft.number='PUR-2026-SERVICE';
  draft.date='2026-10-01';
  draft.dueDate='2026-10-31';
  draft.items=[{...createPurchaseItem(),id:'purchase-line-service',savedItemId:'',
    descriptionEn:'Warehouse service',quantity:'1',unitCost:'120.00'}];
  const posted=postPurchase(draft,[],[]);
  assert.equal(posted.movements.length,0,'service purchase does not generate stock movements');
  posted.purchase.postedAt='2026-10-02T09:00:00.000Z';
  return {base:{...emptyVault(),suppliers:[supplier],purchases:[posted.purchase]},draft,posted:posted.purchase};
}

test('a posted untracked purchase cannot be erased to silently remove its supplier payable',()=>{
  const {base,posted}=fixture(),before=JSON.stringify(base);
  assert.equal(supplierPayablesByCurrency([posted],[],'2026-10-10')[0].remaining,'120.00');
  assert.throws(()=>mergeVaultIntent(base,{...base,purchases:[]},base),
    /posted|reversed|purchase history|reverse.*purchase/i);
  assert.equal(JSON.stringify(base),before,'failed deletion cannot mutate authoritative purchase history');
});

test('reversed purchases remain auditable even without stock or supplier payment records',()=>{
  const {base,posted}=fixture();
  const reversed=reversePurchase(posted,'Contract cancelled',[],[]).purchase;
  const afterReverse=mergeVaultIntent(base,{...base,purchases:[reversed]},base);
  assert.equal(afterReverse.purchases[0].status,'reversed');
  const before=JSON.stringify(afterReverse);
  assert.throws(()=>mergeVaultIntent(afterReverse,{...afterReverse,purchases:[]},afterReverse),
    /posted|reversed|purchase history|reverse.*purchase/i);
  assert.equal(JSON.stringify(afterReverse),before);
});

test('remote deletion of an existing posted purchase cannot be accepted during an unrelated local edit',()=>{
  const {base}=fixture();
  const remote={...base,purchases:[]};
  const expense={...createExpense('USD'),description:'Internet bill',amount:'5.00'};
  assert.throws(()=>mergeVaultIntent(base,{...base,expenses:[expense]},remote),
    /posted|reversed|purchase history|reverse.*purchase/i);
  assert.equal(base.purchases.length,1);
});

test('ordinary draft cleanup and the explicit posted purchase reversal remain allowed',()=>{
  const {base,posted,draft}=fixture();
  const draftOnly={...base,purchases:[draft]};
  const clean=mergeVaultIntent(draftOnly,{...draftOnly,purchases:[]},draftOnly);
  assert.equal(clean.purchases.length,0,'unposted draft may still be discarded');
  const reversed=reversePurchase(posted,'Service disputed',[],[]).purchase;
  const saved=mergeVaultIntent(base,{...base,purchases:[reversed]},base);
  assert.equal(saved.purchases.length,1);
  assert.equal(saved.purchases[0].status,'reversed');
  assert.equal(saved.purchases[0].id,posted.id);
  assert.equal(supplierPayablesByCurrency(saved.purchases,[],'2026-10-10')[0].remaining,'120.00',
    'historic supplier payable remains visible before reversal date');
});
