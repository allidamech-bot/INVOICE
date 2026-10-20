import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createExpense,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment} from '../dist/src/lib/payables.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function setup(){
  const supplier={...createSupplier(),id:'history-linked-supplier',
    nameEn:'Audited Vendor'};
  const independent={...createSupplier(),id:'unrelated-supplier',
    nameEn:'Unrelated Vendor'};
  const root={...emptyVault(),suppliers:[supplier,independent]};
  const expense={...createExpense('USD'),id:'supplier-linked-expense',
    date:'2026-10-05',supplierId:supplier.id,description:'Consultancy',
    amount:'24.00'};
  const purchase={...createPurchase([],[supplier],'USD'),
    id:'supplier-linked-purchase',number:'PUR-SUPPLIER-HISTORY-01',
    date:'2026-10-01',dueDate:'2026-11-01',
    items:[{...createPurchaseItem(),descriptionEn:'Supplier service',quantity:'1',
      unitCost:'100.00'}]};
  const posted=postPurchase(purchase,[],[]).purchase;
  const payment=normalizeSupplierPayment(posted,supplier,[],{
    ...createSupplierPayment(posted,supplier,[]),id:'historical-supplier-settlement',
    date:'2026-10-10',amount:'40.00'});
  return {root,supplier,independent,expense,posted,payment};
}
function unrelatedExpense(base){
  return {...base,expenses:[...base.expenses,{...createExpense('USD'),
    id:'separate-general-expense',description:'Office electricity',amount:'7.00'}]};
}

test('supplier with a recorded supplier payment cannot be deleted by local direct vault save',()=>{
  const {root,supplier,independent,posted,payment}=setup();
  const base={...root,purchases:[posted],supplierPayments:[payment]},before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,suppliers:[independent]},base),
    /supplier with recorded payments or expenses cannot be deleted/i);
  assert.equal(JSON.stringify(base),before);
  assert.equal(base.suppliers[0].id,supplier.id);
});

test('remote removal of supplier linked to settled purchase cannot accompany independent local edit',()=>{
  const {root,independent,posted,payment}=setup();
  const base={...root,purchases:[posted],supplierPayments:[payment]};
  assert.throws(()=>mergeVaultIntent(base,unrelatedExpense(base),
    {...base,suppliers:[independent]}),
    /supplier with recorded payments or expenses cannot be deleted/i);
});

test('supplier referenced by a historical expense cannot be silently removed locally or remotely',()=>{
  const {root,independent,expense}=setup(),base={...root,expenses:[expense]};
  assert.throws(()=>mergeVaultIntent(base,{...base,suppliers:[independent]},base),
    /supplier with recorded payments or expenses cannot be deleted/i);
  assert.throws(()=>mergeVaultIntent(base,unrelatedExpense(base),
    {...base,suppliers:[independent]}),
    /supplier with recorded payments or expenses cannot be deleted/i);
});

test('concurrent new expense referencing supplier blocks an unrelated remote deletion',()=>{
  const {root,independent,expense}=setup();
  assert.throws(()=>mergeVaultIntent(root,{...root,expenses:[expense]},
    {...root,suppliers:[independent]}),
    /supplier with recorded payments or expenses cannot be deleted/i);
});

test('unlinked supplier deletion remains allowed and posted purchase retains supplier snapshot',()=>{
  const {root,supplier,independent,posted}=setup();
  const base={...root,purchases:[posted]};
  const merged=mergeVaultIntent(base,{...base,suppliers:[independent]},base);
  assert.equal(merged.suppliers.length,1);
  assert.equal(merged.purchases[0].supplierSnapshot.sourceSupplierId,supplier.id);
  assert.equal(merged.purchases[0].supplierSnapshot.nameEn,supplier.nameEn);
});

test('unlinked supplier can be deleted on remote side while local unrelated cost saves',()=>{
  const {root,independent}=setup();
  const merged=mergeVaultIntent(root,unrelatedExpense(root),
    {...root,suppliers:[independent]});
  assert.equal(merged.suppliers.length,1);
  assert.equal(merged.expenses.length,1);
});

test('a previously missing legacy supplier is not auto-recreated or retroactively rejected',()=>{
  const {root,independent,expense}=setup();
  const base={...root,suppliers:[independent],expenses:[expense]};
  const before=JSON.stringify(base);
  const merged=mergeVaultIntent(base,unrelatedExpense(base),structuredClone(base));
  assert.equal(merged.suppliers.length,1);
  assert.equal(merged.expenses[0].supplierId,expense.supplierId);
  assert.equal(JSON.stringify(base),before);
});
