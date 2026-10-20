import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense,createPurchase,createPurchaseItem,createSupplier,postPurchase} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment,purchasePayableSummary,voidSupplierPayment} from '../dist/src/lib/payables.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const supplier={...createSupplier(),id:'supplier-remote-new-payment',nameEn:'Warehouse Services'};
  const draft=createPurchase([],[supplier],'USD');
  draft.id='purchase-remote-new-payment';draft.number='PUR-REMOTE-PAY-01';
  draft.date='2026-10-01';draft.dueDate='2026-10-31';
  draft.items=[{...createPurchaseItem(),savedItemId:'',descriptionEn:'Warehousing fee',
    quantity:'1',unitCost:'150.00'}];
  const posted=postPurchase(draft,[],[]).purchase;
  const base={...emptyVault(),suppliers:[supplier],purchases:[posted]};
  const payment=normalizeSupplierPayment(posted,supplier,[],{...createSupplierPayment(posted,supplier,[]),
    id:'remote-supplier-payment-new',amount:'45.00',date:'2026-10-12',reference:'BANK-45'});
  return {base,posted,supplier,payment};
}
const unrelated=(base)=>({...base,expenses:[{...createExpense('USD'),id:'unrelated-office-cost',
  description:'Cloud hosting fee',amount:'4.00'}]});

test('remote newly created supplier settlement cannot import malformed grouped amount during unrelated local work',()=>{
  const {base,payment}=fixture(),snapshot=JSON.stringify(base);
  for(const amount of ['1,2.00','12,34.56','1.2,00','١,٢.٠٠']){
    assert.throws(()=>mergeVaultIntent(base,unrelated(base),
      {...base,supplierPayments:[{...payment,amount}]}),
      /new supplier payment amount has invalid monetary grouping/i,amount);
    assert.equal(JSON.stringify(base),snapshot);
  }
});

test('two distinct incoming supplier payments with a reused new ID must not overwrite an earlier settlement',()=>{
  const {base,payment}=fixture();
  const second={...payment,amount:'25.00',reference:'BANK-25'};
  assert.throws(()=>mergeVaultIntent(base,unrelated(base),
    {...base,supplierPayments:[payment,second]}),
    /new supplier payment IDs must be unique/i);
});

test('a new remote already-voided settlement also requires strict original money grammar',()=>{
  const {base,payment}=fixture();
  const cancelled=voidSupplierPayment(payment,'Duplicate transfer');
  assert.throws(()=>mergeVaultIntent(base,unrelated(base),
    {...base,supplierPayments:[{...cancelled,amount:'1,2.00'}]}),
    /new supplier payment amount has invalid monetary grouping/i);
});

test('two valid independently synced supplier settlements preserve payable balances and unrelated expense',()=>{
  const {base,payment,posted,supplier}=fixture();
  const next=normalizeSupplierPayment(posted,supplier,[payment],{
    ...createSupplierPayment(posted,supplier,[payment]),id:'remote-supplier-payment-two',
    amount:'25.00',date:'2026-10-13',reference:'BANK-25'});
  const result=mergeVaultIntent(base,unrelated(base),{...base,supplierPayments:[payment,next]});
  assert.equal(result.supplierPayments.length,2);
  assert.equal(result.expenses.length,1);
  assert.equal(purchasePayableSummary(posted,result.supplierPayments).paid,'70.00');
  assert.equal(purchasePayableSummary(posted,result.supplierPayments).remaining,'80.00');
});

test('previously stored unusual supplier payment amount is not reformatted on cloud replay or unrelated save',()=>{
  const {base,payment,posted}=fixture();
  const legacy={...base,supplierPayments:[{...payment,amount:'1,2.00'}]};
  const before=JSON.stringify(legacy);
  const result=mergeVaultIntent(legacy,unrelated(legacy),structuredClone(legacy));
  assert.equal(result.supplierPayments[0].amount,'1,2.00');
  assert.equal(purchasePayableSummary(posted,result.supplierPayments).paid,'12.00');
  assert.equal(JSON.stringify(legacy),before);
});
