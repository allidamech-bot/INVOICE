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

test('new supplier settlements reject malformed grouped amounts through both entry and vault merge',()=>{
  const existing=fixture();
  const unpaid={...existing,supplierPayments:[]};
  const purchase=unpaid.purchases[0],supplier=unpaid.suppliers[0];
  const original=JSON.stringify(unpaid);
  for(const [i,amount] of ['1,2.00','0,1.00','١,٢.٠٠'].entries()){
    const proposed={...existing.supplierPayments[0],id:'unsafe-'+i,amount};
    assert.throws(()=>normalizeSupplierPayment(purchase,supplier,[],proposed),/payment amount|invalid monetary/i,
      'do not silently reinterpret a new supplier payment');
    assert.throws(()=>mergeVaultIntent(unpaid,{...unpaid,supplierPayments:[proposed]},unpaid),/supplier payment amount|invalid monetary/i,
      'saved payment collection must reject helper bypass');
    assert.equal(JSON.stringify(unpaid),original,'failed save must not mutate historical records');
  }
  const proper={...existing.supplierPayments[0],id:'proper-grouping',amount:'1,200.00'};
  assert.throws(()=>normalizeSupplierPayment(purchase,supplier,[],proper),/remaining purchase balance/,
    'correct grouping is parsed to its actual value, not truncated into an acceptable payment');
});

test('unchanged legacy supplier settlements keep their historical amount and accounting interpretation',()=>{
  const legacy=fixture();
  legacy.supplierPayments[0]={...legacy.supplierPayments[0],amount:'1,2.00'};
  const baseline=JSON.stringify(legacy);
  const merged=mergeVaultIntent(legacy,legacy,legacy);
  assert.equal(merged.supplierPayments[0].amount,'1,2.00');
  assert.equal(purchasePayableSummary(merged.purchases[0],merged.supplierPayments).paid,'12.00');
  assert.equal(JSON.stringify(legacy),baseline,'no repair rewrites the legacy record');
});
