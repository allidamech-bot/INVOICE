import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment,voidSupplierPayment,purchasePayableSummary} from '../dist/src/lib/payables.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const base=emptyVault();
  const supplier=createSupplier();
  supplier.id='supplier-void-fixture';
  supplier.nameEn='Audit Supplier';
  supplier.defaultCurrency='USD';
  const purchase=createPurchase([],[supplier],'USD');
  purchase.status='posted';
  purchase.postedAt='2026-10-01T09:00:00.000Z';
  purchase.date='2026-10-01';
  purchase.dueDate='2026-10-31';
  purchase.items=[{...createPurchaseItem(),quantity:'1',unitCost:'100.00'}];
  const payment=normalizeSupplierPayment(purchase,supplier,[],createSupplierPayment(purchase,supplier,[]));
  return {...base,suppliers:[supplier],purchases:[purchase],supplierPayments:[payment]};
}

test('void is an append-only merge; same payment stays in the encrypted vault',()=>{
  const base=fixture(),original=base.supplierPayments[0];
  const intended={...base,supplierPayments:[voidSupplierPayment(original,'Incorrect payment')]};
  const merged=mergeVaultIntent(base,intended,base);
  assert.equal(merged.supplierPayments.length,1);
  assert.equal(merged.supplierPayments[0].id,original.id);
  assert.ok(merged.supplierPayments[0].voidedAt);
  assert.equal(purchasePayableSummary(merged.purchases[0],merged.supplierPayments).paid,'0.00');
});

test('merge rejects destruction and rewriting of previously recorded supplier payments',()=>{
  const base=fixture(),payment=base.supplierPayments[0];
  assert.throws(()=>mergeVaultIntent(base,{...base,supplierPayments:[]},base),/history cannot be deleted/);
  assert.throws(()=>mergeVaultIntent(base,{...base,supplierPayments:[{...payment,amount:'30.00'}]},base),/immutable/);
  const voided=voidSupplierPayment(payment,'Incorrect payment'),asVoided={...base,supplierPayments:[voided]};
  assert.throws(()=>mergeVaultIntent(asVoided,{...asVoided,supplierPayments:[{...voided,voidedAt:'',voidReason:''}]},asVoided),/cannot be restored/);
});
