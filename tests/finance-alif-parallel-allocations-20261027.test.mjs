import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createSupplier,createPurchase,createPurchaseItem} from '../dist/src/lib/operations.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {normalizeSupplierPayment,purchasePayableSummary} from '../dist/src/lib/payables.js';
import {createTreasuryAccount,createTreasuryEntry,appendTreasuryEntry,
  treasuryAccountBalance,treasuryProjection,treasuryLedgerTotals} from '../dist/src/lib/treasury-ledger.js';
import {treasuryPeriodReport} from '../dist/src/lib/treasury-report.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

// Synthetic two-device merge rehearsal, not a live Firebase or physical-device
// acceptance. Each device starts from an independent clone of the SAME base.
const scope={workspaceId:'default',branchId:'main'};
const date='2026-10-12',asOf='2026-10-31',at='2026-10-12T10:00:00.000Z';
const copy=value=>structuredClone(value);
function setup(){
 const base=emptyVault();
 const invoice=createBlankDocument('invoice','INV-ALIF-PARALLEL',base.company);
 Object.assign(invoice,{id:'qa-parallel-invoice',status:'final',role:'standard',
  lifecycleStatus:'active',issueDate:'2026-10-01',dueDate:'2026-11-30',
  currency:'USD',...scope});
 invoice.customerSnapshot={...invoice.customerSnapshot,
  sourceCustomerId:'qa-parallel-buyer',companyNameEn:'Synthetic Parallel Buyer',companyNameAr:''};
 invoice.items=[{...invoice.items[0],descriptionEn:'Synthetic subscription',
  quantity:'1',unitPrice:'200.00',stockTreatment:'non-stock'}];
 invoice.adjustments={...invoice.adjustments,discountEnabled:false,shippingEnabled:false,
  otherChargesEnabled:false,taxEnabled:false};
 const supplier={...createSupplier(),id:'qa-parallel-supplier',nameEn:'Synthetic Supplier'};
 const purchase=createPurchase([],[supplier],'USD');
 Object.assign(purchase,{id:'qa-parallel-purchase',number:'PUR-ALIF-PARALLEL',status:'posted',
  date:'2026-10-02',dueDate:'2026-11-30',postedAt:'2026-10-02T10:00:00.000Z',...scope});
 purchase.items=[{...createPurchaseItem(),descriptionEn:'Synthetic service',
  quantity:'1',unitCost:'120.00',savedItemId:''}];
 const bank={...createTreasuryAccount({label:'Synthetic USD Bank',kind:'bank',
  currency:'USD',...scope}),id:'qa-parallel-bank'};
 const opening={...createTreasuryEntry('opening-balance','USD'),id:'qa-parallel-opening',
  date:'2026-10-01',amount:'100.00',toAccountId:bank.id,...scope,
  createdAt:'2026-10-01T08:00:00.000Z',updatedAt:'2026-10-01T08:00:00.000Z'};
 return {base:{...base,documents:[invoice],suppliers:[supplier],purchases:[purchase],
   treasuryAccounts:[bank],treasuryEntries:[opening]},
  invoice,supplier,purchase,bank};
}
function customer(base,invoice,amount='50.00'){
 const payment=normalizePaymentRecord(invoice,[],{id:'qa-parallel-receipt',
  invoiceId:invoice.id,invoiceNumber:invoice.number,
  customerId:invoice.customerSnapshot.sourceCustomerId,customerNameEn:'Synthetic Parallel Buyer',
  customerNameAr:'',currency:'USD',amount,date,method:'bank-transfer',reference:'QA-REC',
  notes:'',createdAt:at,updatedAt:at,...scope},[invoice]);
 const withPayment={...base,payments:[payment]};
 const entry={...createTreasuryEntry('collection','USD'),id:'qa-parallel-cash-in',
  ...scope,date,amount,toAccountId:'qa-parallel-bank',sourceType:'customer-payment',
  sourceId:payment.id,createdAt:at,updatedAt:at};
 return appendTreasuryEntry(withPayment,entry);
}
function supplierPaid(base,purchase,supplier,amount='30.00'){
 const payment=normalizeSupplierPayment(purchase,supplier,[],{
  id:'qa-parallel-supplier-pay',purchaseId:purchase.id,purchaseNumber:purchase.number,
  supplierId:supplier.id,supplierNameEn:supplier.nameEn,supplierNameAr:'',
  currency:'USD',amount,date,method:'bank-transfer',reference:'QA-PAY',
  notes:'',createdAt:at,updatedAt:at,voidedAt:'',voidReason:'',...scope});
 const withPayment={...base,supplierPayments:[payment]};
 const entry={...createTreasuryEntry('supplier-payment','USD'),id:'qa-parallel-cash-out',
  ...scope,date,amount,fromAccountId:'qa-parallel-bank',sourceType:'supplier-payment',
  sourceId:payment.id,createdAt:at,updatedAt:at};
 return appendTreasuryEntry(withPayment,entry);
}
function verify(vault,f){
 assert.equal(vault.payments.length,1);
 assert.equal(vault.supplierPayments.length,1);
 assert.equal(vault.treasuryEntries.length,3);
 assert.equal(new Set(vault.treasuryEntries.map(e=>e.id)).size,3);
 assert.equal(invoicePaymentSummary(f.invoice,vault.payments,asOf,vault.documents).remaining,'150.00');
 assert.equal(purchasePayableSummary(f.purchase,vault.supplierPayments,asOf).remaining,'90.00');
 assert.equal(treasuryAccountBalance(f.bank.id,vault.treasuryEntries),'120.00');
 const projection=treasuryProjection(vault.payments,vault.supplierPayments,
  vault.expenses,vault.treasuryEntries,vault.treasuryReconciliations,'USD',asOf);
 const totals=treasuryLedgerTotals(projection,'USD');
 assert.deepEqual([totals.inflow,totals.outflow,totals.net],
  ['50.00','30.00','20.00']);
 assert.equal(projection.filter(r=>!r.fromAccountId&&!r.toAccountId).length,0,
  'neither already allocated payment may reappear as a phantom cash item');
 const report=treasuryPeriodReport({...scope,from:'2026-10-01',to:asOf,
  accounts:vault.treasuryAccounts,entries:vault.treasuryEntries,
  payments:vault.payments,supplierPayments:vault.supplierPayments,
  expenses:vault.expenses,reconciliations:vault.treasuryReconciliations,
  defaultCurrency:'USD'});
 assert.equal(report.accounts[0].closing,'120.00');
 assert.equal(report.unallocated.length,0);
}
test('parallel devices independently allocate customer receipt and supplier payout; both merge orders conserve AR/AP and bank',()=>{
 const f=setup(),frozen=JSON.stringify(f.base);
 const local=customer(copy(f.base),f.invoice),remote=supplierPaid(copy(f.base),f.purchase,f.supplier);
 for(const [intended,latest] of [[local,remote],[remote,local]]){
  const merged=mergeVaultIntent(copy(f.base),copy(intended),copy(latest));
  verify(merged,f);
  const serialized=copy(merged),replayed=mergeVaultIntent(serialized,copy(serialized),copy(serialized));
  verify(replayed,f);
 }
 assert.equal(JSON.stringify(f.base),frozen,'two-device merge must not mutate its shared base');
});

test('two independent devices cannot allocate the same receipt twice under different bank entry IDs',()=>{
 const f=setup(),shared=customer(copy(f.base),f.invoice);
 // Both sides observed the same receipt, but independently created a bank
 // allocation with a different immutable entry ID.
 const unallocated={...shared,treasuryEntries:copy(f.base.treasuryEntries)};
 const one=appendTreasuryEntry(copy(unallocated),{
  ...shared.treasuryEntries.at(-1),id:'qa-parallel-first-allocation'});
 const two=appendTreasuryEntry(copy(unallocated),{
  ...shared.treasuryEntries.at(-1),id:'qa-parallel-second-allocation'});
 const frozen=JSON.stringify(unallocated);
 assert.throws(()=>mergeVaultIntent(copy(unallocated),copy(one),copy(two)),
  /already allocated|مسبق/i,'bank source must not be counted twice on merge');
 assert.equal(JSON.stringify(unallocated),frozen);
 assert.equal(treasuryAccountBalance(f.bank.id,unallocated.treasuryEntries),'100.00');
});

test('stale receipt correction cannot bypass a concurrent bank allocation',()=>{
 const f=setup(),receiptOnly=customer(copy(f.base),f.invoice);
 const base={...receiptOnly,treasuryEntries:copy(f.base.treasuryEntries)};
 const remote=copy(receiptOnly);
 const local={...copy(base),payments:[{...base.payments[0],amount:'60.00',
  updatedAt:'2026-10-20T10:00:00.000Z'}]};
 const frozen=JSON.stringify(base);
 assert.throws(()=>mergeVaultIntent(copy(base),local,remote),
  /Customer payment has an active linked treasury entry|Payment changed on another device/i);
 assert.equal(JSON.stringify(base),frozen,'stale failed edit cannot alter financial state');
 assert.equal(treasuryAccountBalance(f.bank.id,base.treasuryEntries),'100.00');
});
