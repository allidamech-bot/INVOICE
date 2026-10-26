import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,inventoryBalances} from '../dist/src/lib/operations.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {normalizeSupplierPayment,purchasePayableSummary} from '../dist/src/lib/payables.js';
import {receivablesByCurrency} from '../dist/src/lib/receivables.js';
import {createTreasuryAccount,createTreasuryEntry,appendTreasuryEntry,
  treasuryAccountBalance,treasuryLedgerTotals,treasuryProjection} from '../dist/src/lib/treasury-ledger.js';
import {treasuryPeriodReport} from '../dist/src/lib/treasury-report.js';
import {readBackup,readPlainBackup,assertRestorableBackupVault,
  assertPostedStockRestoreContinuity} from '../dist/src/lib/backup.js';
import {createEncryptedBackup} from '../dist/src/crypto/crypto.js';

// Bounded synthetic disaster-recovery rehearsal for the finance Alif gate.
// In-memory only: no Firebase, physical device, real users or live workspaces.
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const scope={workspaceId:'default',branchId:'main'},date='2026-10-12',
  asOf='2026-10-31',at='2026-10-12T10:00:00.000Z';
const buyer={sourceCustomerId:'qa-buyer',companyNameEn:'Synthetic Recovery Buyer',
  companyNameAr:'مشتري تجريبي',contactPerson:'',addressEn:'',addressAr:'',
  city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
const file=data=>{const text=JSON.stringify(data);return{
  size:Buffer.byteLength(text),text:async()=>text
};};
const portable=v=>({format:'LOUREX_WORKSPACE_EXPORT_V2',version:2,
  createdAt:at,payload:v});
const quantity=v=>inventoryBalances(v.savedItems,v.inventoryMovements)
  .find(x=>x.item.id==='qa-recovery-carton')?.quantity;

function createFinancialSnapshot(){
  let vault=emptyVault();
  const supplier={...createSupplier(),id:'qa-recovery-supplier',nameEn:'Synthetic Supplier',
    defaultCurrency:'USD'};
  const item={id:'qa-recovery-carton',sku:'RECOVERY-CARTON-01',
    descriptionEn:'Synthetic Carton',descriptionAr:'كرتون اختبار',
    unit:'Carton',inventoryTracking:'tracked',createdAt:at,updatedAt:at,
    ...scope,lastUnitCost:'',lastCostCurrency:'',
    lastUnitPrice:'10.00',lastCurrency:'USD'};
  vault={...vault,suppliers:[supplier],savedItems:[item]};
  const purchase=createPurchase([],[supplier],'USD');
  Object.assign(purchase,{id:'qa-recovery-purchase',number:'PUR-2026-RECOVERY',
    date:'2026-10-01',dueDate:'2026-11-30',...scope,currency:'USD'});
  purchase.items=[{...createPurchaseItem(item),id:'qa-purchase-line',
    quantity:'200',unitCost:'6.00',landedUnitCost:''}];
  const posted=postPurchase(purchase,vault.savedItems,vault.inventoryMovements);
  vault={...vault,savedItems:posted.savedItems,purchases:[posted.purchase],
    inventoryMovements:[...vault.inventoryMovements,...posted.movements]};
  assert.equal(quantity(vault),'200');

  const invoice=createBlankDocument('invoice','INV-2026-RECOVERY',vault.company);
  Object.assign(invoice,{id:'qa-recovery-invoice',status:'final',
    role:'standard',lifecycleStatus:'active',issueDate:'2026-10-10',
    dueDate:'2026-11-30',currency:'USD',customerSnapshot:buyer,...scope});
  invoice.items=[{...invoice.items[0],id:'qa-invoice-line',
    savedItemId:item.id,skuSnapshot:item.sku,stockTreatment:'tracked',
    unit:item.unit,descriptionEn:item.descriptionEn,quantity:'20',
    unitPrice:'10.00',unitCost:'6.00'}];
  invoice.adjustments={...invoice.adjustments,discountEnabled:false,
    shippingEnabled:false,otherChargesEnabled:false,taxEnabled:false};
  const issued=postIssuedInvoiceStock(vault,invoice);
  assert.equal(issued.created,true);
  vault={...issued.vault,documents:[invoice]};
  assert.equal(quantity(vault),'180');

  const receipt=normalizePaymentRecord(invoice,[],{
    id:'qa-recovery-receipt',invoiceId:invoice.id,
    invoiceNumber:invoice.number,customerId:buyer.sourceCustomerId,
    customerNameEn:buyer.companyNameEn,customerNameAr:buyer.companyNameAr,
    ...scope,date,currency:'USD',amount:'50.00',reference:'QA-RECEIPT',
    method:'bank-transfer',notes:'',createdAt:at,updatedAt:at},[invoice]);
  const supplierPay=normalizeSupplierPayment(posted.purchase,supplier,[],{
    id:'qa-recovery-supplier-payment',purchaseId:posted.purchase.id,
    purchaseNumber:posted.purchase.number,supplierId:supplier.id,
    supplierNameEn:supplier.nameEn,supplierNameAr:'',...scope,date,
    currency:'USD',amount:'30.00',method:'bank-transfer',reference:'QA-SUPPLIER',
    notes:'',createdAt:at,updatedAt:at,voidedAt:'',voidReason:''});
  const bank=createTreasuryAccount({label:'Synthetic USD Recovery Bank',
    kind:'bank',currency:'USD',...scope});
  bank.id='qa-recovery-bank';
  const opening={...createTreasuryEntry('opening-balance','USD'),id:'qa-opening',
    ...scope,date:'2026-10-01',amount:'100.00',toAccountId:bank.id,
    createdAt:'2026-10-01T10:00:00.000Z'};
  vault={...vault,payments:[receipt],supplierPayments:[supplierPay],
    treasuryAccounts:[bank],treasuryEntries:[opening]};
  const deposit={...createTreasuryEntry('collection','USD'),
    id:'qa-recovery-inflow',...scope,date,amount:'50.00',
    toAccountId:bank.id,sourceType:'customer-payment',
    sourceId:receipt.id,createdAt:at,updatedAt:at};
  vault=appendTreasuryEntry(vault,deposit);
  const withdrawal={...createTreasuryEntry('supplier-payment','USD'),
    id:'qa-recovery-outflow',...scope,date,amount:'30.00',
    fromAccountId:bank.id,sourceType:'supplier-payment',
    sourceId:supplierPay.id,createdAt:at,updatedAt:at};
  vault=appendTreasuryEntry(vault,withdrawal);
  assert.doesNotThrow(()=>assertRestorableBackupVault(vault));
  return vault;
}

function assertFinancialSnapshot(vault){
  assert.equal(quantity(vault),'180','issued invoice stock survives recovery');
  assert.equal(vault.inventoryMovements.filter(x=>x.sourceId==='qa-recovery-invoice').length,
    1,'exactly one final-invoice stock debit survives recovery');
  assert.equal(vault.purchases.filter(x=>x.status==='posted').length,1,
    'purchase posting history survives recovery');
  const invoice=vault.documents.find(x=>x.id==='qa-recovery-invoice');
  assert.ok(invoice&&invoice.status==='final');
  const ar=invoicePaymentSummary(invoice,vault.payments,asOf,vault.documents);
  assert.deepEqual([ar.total,ar.paid,ar.remaining],
    ['200.00','50.00','150.00']);
  const currencies=receivablesByCurrency(vault.documents,vault.payments,asOf);
  assert.deepEqual([currencies[0].paid,currencies[0].outstanding],
    ['50.00','150.00']);
  const purchase=vault.purchases[0];
  assert.equal(purchasePayableSummary(purchase,vault.supplierPayments,asOf).remaining,
    '1170.00','supplier balance survives recovery');
  assert.equal(treasuryAccountBalance('qa-recovery-bank',vault.treasuryEntries),
    '120.00','bank register survives recovery');
  const rows=treasuryProjection(vault.payments,vault.supplierPayments,
    vault.expenses,vault.treasuryEntries,vault.treasuryReconciliations,'USD',asOf);
  const totals=treasuryLedgerTotals(rows,'USD');
  assert.deepEqual([totals.inflow,totals.outflow,totals.net],
    ['50.00','30.00','20.00']);
  const report=treasuryPeriodReport({...scope,from:'2026-10-01',
    to:asOf,accounts:vault.treasuryAccounts,entries:vault.treasuryEntries,
    reconciliations:vault.treasuryReconciliations,
    payments:vault.payments,supplierPayments:vault.supplierPayments,
    expenses:vault.expenses,defaultCurrency:'USD'});
  assert.equal(report.accounts[0].closing,'120.00',
    'period report matches restored bank register');
}

test('Alif DR: portable full-finance archive restores stock, AR/AP and bank from clean state',async()=>{
  const original=createFinancialSnapshot();
  assertFinancialSnapshot(original);
  const frozen=JSON.stringify(original);
  // A fresh device has no previous business state, not a simulated production login.
  let freshDeviceVault=emptyVault();
  assert.equal(freshDeviceVault.documents.length,0);
  const restored=await readPlainBackup(file(portable(original)));
  assert.deepEqual(restored,original,
    'restore preserves every financial collection and history exactly');
  freshDeviceVault=restored;
  assertFinancialSnapshot(freshDeviceVault);
  assert.equal(JSON.stringify(original),frozen,
    'reading portable archive cannot mutate the original live state');
  assert.doesNotThrow(()=>assertPostedStockRestoreContinuity(original,restored));
});

test('Alif DR: AES-GCM password backup recovers same posted balances and rejects incorrect secret',async()=>{
  const original=createFinancialSnapshot();
  const key='Synthetic DR separate recovery passphrase 2026!';
  const encrypted=await createEncryptedBackup(key,original);
  assert.equal(encrypted.format,'LOUREX_BACKUP');
  assert.ok(!JSON.stringify(encrypted).includes('Synthetic Recovery Buyer'),
    'confidential financial source text cannot appear in encrypted backup');
  const restored=await readBackup(file(encrypted),key);
  assert.deepEqual(restored,original,
    'encrypted recovery preserves whole current-schema financial state');
  assertFinancialSnapshot(restored);
  await assert.rejects(readBackup(file(encrypted),'Wrong recovery key'),
    /password|incorrect|decrypt/i);
});

test('Alif DR: tampered debit is refused; stale backup cannot roll back posted stock',async()=>{
  const original=createFinancialSnapshot();
  const corrupt=structuredClone(original);
  const debit=corrupt.inventoryMovements.find(x=>x.sourceId==='qa-recovery-invoice');
  assert.ok(debit,'real issued debit must exist for tampering test');
  debit.quantity='-30.0000';
  const snapshot=JSON.stringify(original);
  await assert.rejects(readPlainBackup(file(portable(corrupt))),
    /Backup posted-invoice stock ledger/,
    'tampered issue must fail validation before any state replacement');
  const old=emptyVault();
  assert.throws(()=>assertPostedStockRestoreContinuity(original,old),
    /posted invoice stock|older local copy/,
    'stale backup cannot erase immutable issued invoice history');
  assert.equal(JSON.stringify(original),snapshot,
    'all refused recovery operations must leave source financial state unchanged');
});
