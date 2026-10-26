import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createSupplier,createPurchase,createPurchaseItem} from '../dist/src/lib/operations.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {normalizeSupplierPayment,purchasePayableSummary,voidSupplierPayment,supplierStatement} from '../dist/src/lib/payables.js';
import {customerStatement,receivablesByCurrency} from '../dist/src/lib/receivables.js';
import {customerPaymentVoucher,supplierPaymentVoucher} from '../dist/src/lib/payment-voucher.js';
import {
  createTreasuryAccount,createTreasuryEntry,appendTreasuryEntry,
  treasuryAccountBalance,treasuryLinkedSourceUsed,treasuryProjection,
  voidTreasuryEntry
} from '../dist/src/lib/treasury-ledger.js';
import {treasuryPeriodReport} from '../dist/src/lib/treasury-report.js';

// These are isolated in-memory records. No Firebase credentials, live account,
// UI automation or production financial documents are read or written.
const day='2026-10-12',asOf='2026-10-31',at='2026-10-12T10:00:00.000Z';
const snapshot=()=>({sourceCustomerId:'qa-buyer',companyNameEn:'Synthetic QA Buyer',
  companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',
  country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''});

function fixture(){
  const vault=emptyVault();
  vault.company.nameEn='LOUREX Synthetic QA';
  const bank=createTreasuryAccount({
    label:'Synthetic USD bank',kind:'bank',currency:'USD',workspaceId:'default',branchId:'main'
  });
  bank.id='qa-usd-bank';
  vault.treasuryAccounts=[bank];
  const opening={...createTreasuryEntry('opening-balance','USD'),id:'qa-opening',
    workspaceId:'default',branchId:'main',date:'2026-09-30',amount:'100.00',
    fromAccountId:'',toAccountId:bank.id,createdAt:'2026-09-30T10:00:00.000Z'};
  vault.treasuryEntries=[opening];

  const invoice=createBlankDocument('invoice','INV-QA-AR-200',vault.company);
  Object.assign(invoice,{id:'qa-issued-invoice',status:'final',role:'standard',
    lifecycleStatus:'active',issueDate:'2026-10-01',dueDate:'2026-11-01',
    currency:'USD',workspaceId:'default',branchId:'main',
    customerSnapshot:snapshot()});
  invoice.items=[{...invoice.items[0],descriptionEn:'Synthetic service',
    quantity:'1',unitPrice:'200.00'}];
  invoice.adjustments={...invoice.adjustments,discountEnabled:false,
    shippingEnabled:false,otherChargesEnabled:false,taxEnabled:false};
  const payment=normalizePaymentRecord(invoice,[],{
    id:'qa-customer-receipt',invoiceId:invoice.id,invoiceNumber:invoice.number,
    customerId:'qa-buyer',customerNameEn:'Synthetic QA Buyer',customerNameAr:'',
    workspaceId:'default',branchId:'main',currency:'USD',amount:'50.00',date:day,
    method:'bank-transfer',reference:'BANK-CUST-QA',notes:'',
    createdAt:at,updatedAt:at
  },[invoice]);
  vault.documents=[invoice];vault.payments=[payment];

  const supplier=createSupplier();
  supplier.id='qa-supplier';supplier.nameEn='Synthetic QA Supplier';
  supplier.defaultCurrency='USD';
  const purchase=createPurchase([],[supplier],'USD');
  Object.assign(purchase,{id:'qa-posted-purchase',number:'PUR-QA-AP-120',
    status:'posted',date:'2026-10-02',dueDate:'2026-11-02',
    postedAt:'2026-10-02T09:00:00.000Z',
    workspaceId:'default',branchId:'main'});
  purchase.items=[{...createPurchaseItem(),descriptionEn:'Synthetic service',
    quantity:'1',unitCost:'120.00'}];
  const supplierPayment=normalizeSupplierPayment(purchase,supplier,[],{
    id:'qa-supplier-disbursement',purchaseId:purchase.id,purchaseNumber:purchase.number,
    supplierId:supplier.id,supplierNameEn:supplier.nameEn,supplierNameAr:'',
    workspaceId:'default',branchId:'main',currency:'USD',amount:'30.00',date:day,
    method:'bank-transfer',reference:'BANK-SUPP-QA',notes:'',
    createdAt:at,updatedAt:at,voidedAt:'',voidReason:''
  });
  vault.suppliers=[supplier];vault.purchases=[purchase];
  vault.supplierPayments=[supplierPayment];
  return{vault,bank,invoice,payment,purchase,supplier,supplierPayment};
}

function movement(type,bank,sourceId,amount,id){
  const inbound=type==='collection';
  return{...createTreasuryEntry(type,'USD'),id,workspaceId:'default',
    branchId:'main',date:day,amount,fromAccountId:inbound?'':bank.id,
    toAccountId:inbound?bank.id:'',sourceType:inbound?'customer-payment':'supplier-payment',
    sourceId,reference:id,createdAt:at,updatedAt:at};
}
function report(vault){
  return treasuryPeriodReport({workspaceId:'default',branchId:'main',
    from:'2026-10-01',to:asOf,defaultCurrency:'USD',accounts:vault.treasuryAccounts,
    entries:vault.treasuryEntries,reconciliations:vault.treasuryReconciliations,
    payments:vault.payments,supplierPayments:vault.supplierPayments,
    expenses:vault.expenses});
}
function available(vault){
  return treasuryProjection(vault.payments,vault.supplierPayments,
    vault.expenses,vault.treasuryEntries,vault.treasuryReconciliations,'USD',asOf)
    .filter(row=>!row.fromAccountId&&!row.toAccountId);
}

test('Alif vouchers: one persisted receipt and supplier disbursement match AR/AP snapshots',()=>{
  const f=fixture(),before=JSON.stringify(f.vault);
  const receipt=customerPaymentVoucher(f.invoice,f.payment.id,f.vault.payments);
  const disbursement=supplierPaymentVoucher(
    f.purchase,f.supplierPayment.id,f.vault.supplierPayments,f.vault.company);
  assert.deepEqual([receipt.kind,receipt.amount,receipt.recordId],
    ['customer-receipt','50.00',f.payment.id]);
  assert.deepEqual([disbursement.kind,disbursement.amount,disbursement.recordId],
    ['supplier-disbursement','30.00',f.supplierPayment.id]);
  const invoiceSummary=invoicePaymentSummary(f.invoice,f.vault.payments,asOf,f.vault.documents);
  assert.deepEqual([invoiceSummary.total,invoiceSummary.paid,invoiceSummary.remaining],
    ['200.00','50.00','150.00']);
  const receivables=receivablesByCurrency(f.vault.documents,f.vault.payments,asOf);
  assert.deepEqual([receivables[0].billed,receivables[0].paid,receivables[0].outstanding],
    ['200.00','50.00','150.00']);
  const payable=purchasePayableSummary(f.purchase,f.vault.supplierPayments,asOf);
  assert.deepEqual([payable.total,payable.paid,payable.remaining],
    ['120.00','30.00','90.00']);
  const customerLedger=customerStatement('qa-buyer',f.vault.documents,f.vault.payments,asOf)[0];
  const supplierLedger=supplierStatement(f.supplier.id,f.vault.purchases,f.vault.supplierPayments,asOf)[0];
  assert.equal(customerLedger.outstanding,'150.00');
  assert.equal(supplierLedger.remaining,'90.00');
  assert.equal(JSON.stringify(f.vault),before,'financial read paths remain read-only');
});

test('Alif treasury: payments alone are unallocated, then post once to cash/bank',()=>{
  const f=fixture();
  assert.equal(treasuryAccountBalance(f.bank.id,f.vault.treasuryEntries),'100.00');
  assert.equal(report(f.vault).accounts[0].closing,'100.00');
  assert.deepEqual(available(f.vault).map(x=>x.source).sort(),
    ['collection','supplier-payment']);
  assert.equal(report(f.vault).unallocated.length,2);
  const customerEntry=movement('collection',f.bank,f.payment.id,'50.00','qa-bank-collection');
  const withCustomer=appendTreasuryEntry(f.vault,customerEntry);
  assert.equal(treasuryAccountBalance(f.bank.id,withCustomer.treasuryEntries),'150.00');
  assert.equal(report(withCustomer).unallocated.length,1);
  const supplierEntry=movement('supplier-payment',f.bank,f.supplierPayment.id,'30.00','qa-bank-disbursement');
  const settled=appendTreasuryEntry(withCustomer,supplierEntry);
  assert.equal(treasuryAccountBalance(f.bank.id,settled.treasuryEntries),'120.00');
  assert.equal(report(settled).accounts[0].closing,'120.00');
  assert.equal(report(settled).unallocated.length,0);
  assert.equal(available(settled).length,0);
  assert.equal(treasuryLinkedSourceUsed(settled.treasuryEntries,'customer-payment',f.payment.id),true);
  assert.equal(treasuryLinkedSourceUsed(settled.treasuryEntries,'supplier-payment',f.supplierPayment.id),true);
  assert.equal(receivablesByCurrency(settled.documents,settled.payments,asOf)[0].outstanding,'150.00');
  assert.equal(purchasePayableSummary(f.purchase,settled.supplierPayments,asOf).remaining,'90.00');
});

test('Alif treasury: duplicate links, currency/amount and cross-branch inputs are rejected',()=>{
  const f=fixture(),base=appendTreasuryEntry(f.vault,
    movement('collection',f.bank,f.payment.id,'50.00','qa-collected'));
  assert.throws(()=>appendTreasuryEntry(base,movement('collection',f.bank,f.payment.id,'50.00','qa-collected-again')),
    /already allocated|مسبق/);
  assert.throws(()=>appendTreasuryEntry(f.vault,movement('collection',f.bank,f.payment.id,'49.99','qa-wrong-amount')),
    /amount or currency|مبلغ/);
  assert.throws(()=>appendTreasuryEntry(f.vault,
    {...movement('collection',f.bank,f.payment.id,'50.00','qa-wrong-branch'),branchId:'other'}),
    /Workspace changed|مساحة/);
  assert.throws(()=>appendTreasuryEntry(f.vault,{...movement('supplier-payment',f.bank,f.supplierPayment.id,'30.00','qa-eur'),currency:'EUR'}),
    /currency|عملة/i);
  assert.equal(treasuryAccountBalance(f.bank.id,f.vault.treasuryEntries),'100.00',
    'rejected entries do not mutate stored records');
});

test('Alif treasury: cancellation restores unallocated movement, not AR/AP amounts',()=>{
  const f=fixture();
  const paid=appendTreasuryEntry(f.vault,
    movement('supplier-payment',f.bank,f.supplierPayment.id,'30.00','qa-paid'));
  assert.equal(treasuryAccountBalance(f.bank.id,paid.treasuryEntries),'70.00');
  const voided=voidTreasuryEntry(paid.treasuryEntries.at(-1),'Synthetic payment reallocation');
  const changed={...paid,treasuryEntries:paid.treasuryEntries.map(x=>x.id===voided.id?voided:x)};
  assert.equal(treasuryAccountBalance(f.bank.id,changed.treasuryEntries),'100.00');
  assert.equal(available(changed).filter(r=>r.id===f.supplierPayment.id).length,1);
  assert.equal(purchasePayableSummary(f.purchase,changed.supplierPayments,asOf).remaining,'90.00');
  assert.equal(supplierPaymentVoucher(f.purchase,f.supplierPayment.id,changed.supplierPayments,f.vault.company).amount,'30.00');
});

test('Alif supplier: payment void is separate from voiding treasury allocation',()=>{
  const f=fixture();
  const paid=appendTreasuryEntry(f.vault,
    movement('supplier-payment',f.bank,f.supplierPayment.id,'30.00','qa-supp-linked'));
  // Source must not be voided while the bank entry is active. The real
  // persistence boundary enforces this separately (vault-merge guard).
  assert.equal(treasuryLinkedSourceUsed(paid.treasuryEntries,'supplier-payment',f.supplierPayment.id),true);
  const detached={...paid,treasuryEntries:paid.treasuryEntries.map(x=>
    x.sourceId===f.supplierPayment.id?voidTreasuryEntry(x,'Correct supplier payment'):x)};
  assert.equal(treasuryLinkedSourceUsed(detached.treasuryEntries,'supplier-payment',f.supplierPayment.id),false);
  const cancelled=voidSupplierPayment(detached.supplierPayments[0],'Correct supplier settlement');
  const updated={...detached,supplierPayments:[cancelled]};
  assert.equal(purchasePayableSummary(f.purchase,updated.supplierPayments,asOf).remaining,'120.00');
  assert.throws(()=>supplierPaymentVoucher(f.purchase,cancelled.id,updated.supplierPayments,f.vault.company),/active linked/);
  assert.throws(()=>appendTreasuryEntry(updated,movement('supplier-payment',f.bank,cancelled.id,'30.00','qa-voided-repost')),
    /Voided supplier payments|ملغاة/);
  assert.equal(treasuryAccountBalance(f.bank.id,updated.treasuryEntries),'100.00');
});
