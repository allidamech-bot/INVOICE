import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault,defaultCompany,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment,purchasePayableSummary} from '../dist/src/lib/payables.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

// Factories must create records before the fixed historical report cutoff.
// Each test's mock clock is automatically restored by its test context.
beforeEach(t=>t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,9,10,12)}));

function customerFixture(){
  const invoice=createBlankDocument('invoice','INV-UNIQUE-ID',defaultCompany());
  invoice.status='final';invoice.lifecycleStatus='active';invoice.issueDate='2026-10-01';invoice.dueDate='2026-12-01';
  invoice.customerSnapshot=customerSnapshotFrom({id:'buyer-unique',companyNameEn:'Collision Buyer',companyNameAr:'',
    contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''});
  invoice.items[0].descriptionEn='Product';invoice.items[0].quantity='1';invoice.items[0].unitPrice='200.00';
  const base={...emptyVault(),documents:[invoice]};
  const first=normalizePaymentRecord(invoice,[],{id:'same-new-customer-id',amount:'20.00',date:'2026-10-02',
    method:'cash',reference:'R-1',notes:''},[invoice]);
  const second={...first,amount:'35.00',reference:'R-2'};
  return {base,invoice,first,second};
}

function supplierFixture(){
  const supplier={...createSupplier(),nameEn:'Collision Supplier'};
  const item={id:'unique-item',sku:'UNIQUE-ITEM',descriptionEn:'Part',descriptionAr:'',unit:'PCS',lastUnitCost:'5',lastCostCurrency:'USD'};
  const purchase=createPurchase([],[supplier],'USD');
  purchase.items=[{...createPurchaseItem(item),quantity:'10',unitCost:'5'}];
  const posted=postPurchase(purchase,[item]).purchase;
  const first=normalizeSupplierPayment(posted,supplier,[],
    {...createSupplierPayment(posted,supplier,[]),id:'same-new-supplier-id',amount:'10.00'});
  const second={...first,amount:'15.00',reference:'VENDOR-2'};
  const base={...emptyVault(),suppliers:[supplier],purchases:[posted]};
  return {base,posted,first,second};
}

test('new customer payment IDs must not collapse two different receipts into the last record',()=>{
  const {base,first,second}=customerFixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,payments:[first,second]},base),
    /customer payment.*(unique|duplicate|already)/i,
    'two customer receipts sharing one fresh ID must fail before generic record merging');
  assert.equal(JSON.stringify(base),before,'rejected write cannot mutate original vault');
});

test('new supplier payment IDs must not collapse two settlements into the last record',()=>{
  const {base,first,second}=supplierFixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,supplierPayments:[first,second]},base),
    /supplier payment.*(unique|duplicate|already)/i,
    'two supplier payments sharing one fresh ID must fail before generic record merging');
  assert.equal(JSON.stringify(base),before,'rejected write cannot mutate original vault');
});

test('distinct valid customer receipts and supplier settlements remain accepted and counted once each',()=>{
  const buyer=customerFixture();
  const c2={...buyer.second,id:'new-customer-id-2'};
  const cash=mergeVaultIntent(buyer.base,{...buyer.base,payments:[buyer.first,c2]},buyer.base);
  assert.equal(cash.payments.length,2);
  assert.equal(invoicePaymentSummary(buyer.invoice,cash.payments,'2026-10-20',cash.documents).paid,'55.00');
  const vendor=supplierFixture(),s2={...vendor.second,id:'new-supplier-id-2'};
  assert.equal(vendor.first.date,'2026-10-10');
  const posted=mergeVaultIntent(vendor.base,{...vendor.base,supplierPayments:[vendor.first,s2]},vendor.base);
  assert.equal(posted.supplierPayments.length,2);
  assert.equal(purchasePayableSummary(vendor.posted,posted.supplierPayments,'2026-10-20').paid,'25.00');
});

test('unchanged customer payment history is not rewritten merely to enforce new IDs',()=>{
  const {base,first}=customerFixture();
  const historic={...base,payments:[{...first,amount:'1,2.00'}]};
  const original=JSON.stringify(historic);
  const read=mergeVaultIntent(historic,historic,historic);
  assert.equal(read.payments[0].amount,'1,2.00');
  assert.equal(JSON.stringify(historic),original);
});
