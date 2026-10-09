import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(p,'utf8');

test('supplier payments are a separate encrypted accounting domain',async()=>{
  const [types,defaults,vault]=await Promise.all([read('src/types.ts'),read('src/lib/defaults.ts'),read('src/storage/vault.ts')]);
  assert.match(types,/interface SupplierPaymentRecord/);
  assert.match(types,/supplierPayments: SupplierPaymentRecord\[\]/);
  assert.match(types,/interface PaymentRecord/);
  assert.doesNotMatch(types,/interface PaymentRecord[\s\S]*purchaseId:/);
  const schemaVersion=Number(/export const APP_SCHEMA_VERSION = (\d+);/.exec(defaults)?.[1]??0);
  assert.ok(schemaVersion>=16,'Accounts Payable requires encrypted vault schema v16 or newer.');
  assert.match(defaults,/v16 adds purchase due dates and a distinct encrypted supplier-payment ledger/);
  assert.match(defaults,/supplierPayments: \[\]/);
  assert.match(vault,/dueDate:stringValue\(purchase\?\.dueDate,stringValue\(purchase\?\.date\)\)/);
  assert.match(vault,/migrated\.supplierPayments/);
});

test('payables engine is deterministic, purchase-linked and currency-safe',async()=>{
  const engine=await read('src/lib/payables.ts');
  assert.match(engine,/payment\.purchaseId!==purchase\.id/);
  assert.match(engine,/payment\.supplierId!==supplierId/);
  assert.match(engine,/Supplier payment currency must match the purchase currency/);
  assert.match(engine,/FX conversion is not performed automatically/);
  assert.match(engine,/paidExcludingCurrent\+amount>total/);
  assert.match(engine,/purchase\.status!=='posted'/);
  assert.match(engine,/supplierAgingBucketFor/);
  assert.match(engine,/supplierStatement/);
});

test('sync merge protects concurrent AP edits and financial invariants',async()=>{
  const merge=await read('src/storage/vault-merge.ts');
  assert.match(merge,/guardConcurrentRecordChanges\(base\.supplierPayments,intended\.supplierPayments,latest\.supplierPayments/);
  assert.match(merge,/assertSupplierPaymentInvariant\(purchases,suppliers,supplierPayments\)/);
  assert.match(merge,/supplierPayments,/);
});

test('Finance exposes receivables, supplier payables and expenses in the frozen workspace',async()=>{
  const finance=await read('src/components/FinanceWorkspace.tsx');
  assert.match(finance,/type Tab=[^;]*'receivables'[^;]*'payables'[^;]*'expenses'/);
  assert.match(finance,/Supplier Payables/);
  assert.match(finance,/مستحقات الموردين/);
  assert.match(finance,/<SupplierPayablesPage/);
  assert.match(finance,/lourex-finance-supplier-payables/);
});

test('supplier payables UI includes aging, payments, statements and no hidden FX',async()=>{
  const page=await read('src/components/SupplierPayablesPage.tsx');
  for(const token of ['Payables Aging','Record Supplier Payment','Supplier Statement','Paid','Remaining','Due','Print / Save PDF'])assert.match(page,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(page,/no automatic FX conversion/i);
  assert.match(page,/Currencies remain separate/);
  assert.match(page,/onDeleteSupplierPayment/);
});

test('Purchasing exposes due date and contextual AP status without moving supplier finance into Purchasing',async()=>{
  const operations=await read('src/components/OperationsPage.tsx');
  assert.match(operations,/Due date/);
  assert.match(operations,/Draft commitment/);
  assert.match(operations,/Open in Finance/);
  assert.match(operations,/supplierPayablesByCurrency/);
  assert.match(operations,/purchasePayableSummary/);
});

test('App persists supplier payments and blocks unsafe purchase reversal',async()=>{
  const app=await read('src/app/App.tsx');
  assert.match(app,/private saveSupplierPayment=/);
  assert.match(app,/normalizeSupplierPayment/);
  assert.match(app,/private deleteSupplierPayment=/);
  assert.match(app,/vault\.supplierPayments\.some\(payment=>payment\.purchaseId===current\.id&&!payment\.voidedAt\)/);
  assert.match(app,/voidSupplierPayment\(original/);
  assert.doesNotMatch(app,/supplierPayments:vault\.supplierPayments\.filter\(item=>item\.id!==payment\.id\)/,'recorded supplier payments must never be hard deleted');
  assert.match(app,/supplierPayments:vault\.supplierPayments/);
});

test('Batch 9 mobile, RTL, print and reduced-motion affordances remain explicit',async()=>{
  const css=await read('src/styles/payables-batch9.css');
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/html\[dir="rtl"\]/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media print/);
});
test('supplier payment cancellations preserve journal and treasury provenance',async()=>{
  const [types,vault,engine,treasury,merge,page]=await Promise.all([
    read('src/types.ts'),read('src/storage/vault.ts'),read('src/lib/payables.ts'),
    read('src/lib/treasury-ledger.ts'),read('src/storage/vault-merge.ts'),read('src/components/SupplierPayablesPage.tsx')
  ]);
  assert.match(types,/voidedAt\?: string/);
  assert.match(vault,/voidedAt:stringValue\(payment\?\.voidedAt\)/);
  assert.match(engine,/export function voidSupplierPayment\(/);
  assert.match(engine,/payment\.voidedAt\)/);
  assert.match(merge,/Supplier payment history cannot be deleted/);
  assert.match(merge,/A voided supplier payment cannot be restored or changed/);
  assert.match(treasury,/if\(item\.voidedAt\|\|supplierLinks\.has\(item\.id\)\)continue/);
  assert.match(page,/Void supplier payment\?/);
});

test('supplier payment void requires an explicit user reason that crosses all finance layers',async()=>{
  const [page,finance,app]=await Promise.all([
    read('src/components/SupplierPayablesPage.tsx'),read('src/components/FinanceWorkspace.tsx'),read('src/app/App.tsx')
  ]);
  assert.match(page,/Cancellation reason \(required\)/);
  assert.match(page,/voidReason\.trim\(\)/);
  assert.match(page,/onDeleteSupplierPayment\(payment,reason\)/);
  assert.match(finance,/onDeleteSupplierPayment:\(payment:SupplierPaymentRecord,reason:string\)/);
  assert.match(app,/deleteSupplierPayment=async\(payment:SupplierPaymentRecord,reason:string\)/);
  assert.match(app,/voidSupplierPayment\(original,reason\)/);
  assert.doesNotMatch(app,/voidSupplierPayment\(original,'Recorded in error/);
});
