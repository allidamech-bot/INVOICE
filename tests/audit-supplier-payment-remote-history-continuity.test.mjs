import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense,createPurchase,createPurchaseItem,createSupplier,postPurchase} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment,voidSupplierPayment,purchasePayableSummary} from '../dist/src/lib/payables.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const supplier={...createSupplier(),id:'supplier-sync-audit',nameEn:'Service supplier'};
  const draft=createPurchase([],[supplier],'USD');
  draft.id='purchase-sync-audit';draft.number='PUR-SYNC-AUDIT';draft.date='2026-10-01';draft.dueDate='2026-11-01';
  draft.items=[{...createPurchaseItem(),id:'purchase-line-service',savedItemId:'',
    descriptionEn:'Storage service',quantity:'1',unitCost:'120.00'}];
  const posted=postPurchase(draft,[],[]).purchase;
  const source=createSupplierPayment(posted,supplier,[]);
  const payment=normalizeSupplierPayment(posted,supplier,[],{...source,id:'supplier-payment-original',
    amount:'40.00',date:'2026-10-02',reference:'BANK-40'});
  return {base:{...emptyVault(),suppliers:[supplier],purchases:[posted],supplierPayments:[payment]},payment,posted,supplier};
}
function unrelatedLocalChange(base){
  const expense={...createExpense('USD'),id:'independent-synced-expense',
    description:'Monthly connectivity',amount:'7.00'};
  return {...base,expenses:[expense]};
}

test('remote deletion of an already saved supplier payment cannot inflate the payable during unrelated save',()=>{
  const {base,posted}=fixture(),before=JSON.stringify(base);
  assert.equal(purchasePayableSummary(posted,base.supplierPayments).paid,'40.00');
  assert.throws(()=>mergeVaultIntent(base,unrelatedLocalChange(base),{...base,supplierPayments:[]}),
    /supplier payment history cannot be deleted/i);
  assert.equal(JSON.stringify(base),before);
});

test('remote rewriting supplier payment amount or purchase link cannot alter historical settlement',()=>{
  const {base,payment}=fixture(),before=JSON.stringify(base);
  for(const remotePayment of [{...payment,amount:'80.00'},
    {...payment,purchaseNumber:'FORGED-PURCHASE'},
    {...payment,reference:'SILENTLY-REPLACED'}]){
    assert.throws(()=>mergeVaultIntent(base,unrelatedLocalChange(base),
      {...base,supplierPayments:[remotePayment]}),
      /recorded supplier payment is immutable/i);
    assert.equal(JSON.stringify(base),before);
  }
});

test('remote cancellation with an audit reason and separately appended payment remain valid',()=>{
  const {base,payment,posted,supplier}=fixture();
  const cancelled=voidSupplierPayment(payment,'Incorrect bank transfer');
  const remoteVoid={...base,supplierPayments:[cancelled]};
  const merged=mergeVaultIntent(base,unrelatedLocalChange(base),remoteVoid);
  assert.equal(merged.supplierPayments[0].id,payment.id);
  assert.equal(merged.supplierPayments[0].voidReason,'Incorrect bank transfer');
  assert.equal(purchasePayableSummary(posted,merged.supplierPayments).paid,'0.00');
  const next=normalizeSupplierPayment(posted,supplier,base.supplierPayments,
    {...createSupplierPayment(posted,supplier,base.supplierPayments),id:'second-valid-payment',
      amount:'20.00',date:'2026-10-03'});
  const appended=mergeVaultIntent(base,unrelatedLocalChange(base),
    {...base,supplierPayments:[payment,next]});
  assert.equal(appended.supplierPayments.length,2);
  assert.equal(purchasePayableSummary(posted,appended.supplierPayments).paid,'60.00');
  assert.equal(appended.expenses.length,1);
});

test('a remote change cannot unvoid or rewrite previously cancelled supplier payment history',()=>{
  const {base,payment}=fixture();
  const voided=voidSupplierPayment(payment,'Duplicate settlement');
  const recorded={...base,supplierPayments:[voided]};
  assert.throws(()=>mergeVaultIntent(recorded,unrelatedLocalChange(recorded),
    {...recorded,supplierPayments:[{...voided,voidedAt:'',voidReason:''}]}),
    /voided supplier payment cannot be restored or changed/i);
  assert.throws(()=>mergeVaultIntent(recorded,unrelatedLocalChange(recorded),
    {...recorded,supplierPayments:[{...voided,voidReason:'Changed reason'}]}),
    /voided supplier payment cannot be restored or changed/i);
});
