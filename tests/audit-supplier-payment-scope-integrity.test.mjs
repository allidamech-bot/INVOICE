import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment,purchasePayableSummary} from '../dist/src/lib/payables.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const supplier={...createSupplier(),nameEn:'Scoped Supplier'};
  const item={id:'scoped-supplier-item',sku:'SCOPE-SUP',descriptionEn:'Part',
    descriptionAr:'',unit:'PCS',lastUnitCost:'5',lastCostCurrency:'USD'};
  const draft=createPurchase([],[supplier],'USD');
  draft.items=[{...createPurchaseItem(item),quantity:'10',unitCost:'5'}];
  const purchase=postPurchase(draft,[item]).purchase;
  purchase.workspaceId='default';purchase.branchId='main';
  const base={...emptyVault(),suppliers:[supplier],purchases:[purchase]};
  const payment=normalizeSupplierPayment(purchase,supplier,[],{
    ...createSupplierPayment(purchase,supplier,[]),
    id:'supplier-payment-scope-1',amount:'10.00',workspaceId:'default',branchId:'main'
  });
  return{base,purchase,payment};
}
const unrelatedSave=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('new local supplier payment cannot settle a purchase from another branch',()=>{
  const {base,payment}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,supplierPayments:[{
    ...payment,branchId:'other-branch'}]},base),
    /same company and branch as its purchase/i);
  assert.equal(JSON.stringify(base),before);
});

test('remote payment from another company or branch fails during unrelated local save',()=>{
  const {base,payment}=fixture();
  for(const wrong of [
    {...payment,workspaceId:'other-company'},
    {...payment,branchId:'other-branch'}
  ])assert.throws(()=>mergeVaultIntent(base,unrelatedSave(base),
      {...base,supplierPayments:[wrong]}),
    /same company and branch as its purchase/i);
});

test('same-branch partial settlements from two devices both survive and total once',()=>{
  const {base,purchase,payment}=fixture();
  const other={...payment,id:'supplier-payment-scope-2',
    amount:'15.00',reference:'PAY-2'};
  const merged=mergeVaultIntent(base,{...base,supplierPayments:[payment]},
    {...base,supplierPayments:[other]});
  assert.equal(merged.supplierPayments.length,2);
  const summary=purchasePayableSummary(purchase,merged.supplierPayments,'2026-10-20');
  assert.equal(summary.paid,'25.00');
  assert.equal(summary.remaining,'25.00');
});

test('identical replay keeps one record and unchanged prior wrong scope is not rewritten',()=>{
  const {base,payment}=fixture();
  const replay=mergeVaultIntent(base,{...base,supplierPayments:[payment]},
    {...base,supplierPayments:[{...payment}]});
  assert.equal(replay.supplierPayments.length,1);
  const historical={...base,supplierPayments:[{...payment,branchId:'historic-branch'}]};
  const before=JSON.stringify(historical);
  const merged=mergeVaultIntent(historical,unrelatedSave(historical),structuredClone(historical));
  assert.equal(merged.supplierPayments[0].branchId,'historic-branch');
  assert.equal(JSON.stringify(historical),before);
});
