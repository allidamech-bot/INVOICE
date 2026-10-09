import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(path,'utf8');

test('v131 stores payments as first-class encrypted vault records',async()=>{
  const [types,defaults,merge,vault]=await Promise.all([read('src/types.ts'),read('src/lib/defaults.ts'),read('src/storage/vault-merge.ts'),read('src/storage/vault.ts')]);
  assert.ok(types.includes('interface PaymentRecord'));
  assert.ok(types.includes('payments: PaymentRecord[]'));
  assert.ok(defaults.includes('APP_SCHEMA_VERSION = 7'));
  assert.ok(defaults.includes('payments: []'));
  assert.ok(merge.includes('const payments=mergeRecords(base.payments,intended.payments,latest.payments)'));
  assert.ok(merge.includes('guardFinancialSettlementChanges(base,intended,documents,payments)'));
  assert.ok(merge.includes('payments,'));
  assert.ok(vault.includes("unique(migrated.payments.map(p => p.id), 'payment')"));
});

test('v131 enforces collection invariants and overpayment protection',async()=>{
  const [payments,app]=await Promise.all([read('src/lib/payments.ts'),read('src/app/App.tsx')]);
  assert.ok(payments.includes('Payment cannot exceed the remaining invoice balance after credit notes.'));
  assert.ok(payments.includes('Invoice balance cannot fall below payments plus issued credit notes.'));
  assert.ok(payments.includes('Invoice currency cannot change after a payment is recorded.'));
  assert.ok(payments.includes('Invoice customer cannot change after a payment is recorded.'));
  assert.ok(payments.includes('accountedInvoicePayments'));
  assert.ok(payments.includes('accountedInvoiceCreditNotes'));
  assert.ok(app.includes('assertInvoicePaymentInvariant(updated,vault.payments,vault.documents)'));
  assert.ok(app.includes('Delete the invoice payments before deleting this invoice.'));
});

test('v131 exposes full and partial receipt workflow with collection status',async()=>{
  const [panel,docs]=await Promise.all([read('src/components/InvoicePaymentsPanel.tsx'),read('src/components/DocumentsPage.tsx')]);
  for(const term of ['Record Payment','Amount','Date','Method','Reference','Notes','Payment history'])assert.ok(panel.includes(term),term);
  assert.ok(panel.includes('summary.remaining'));
  assert.ok(panel.includes('payment-integrity-warning'));
  assert.ok(docs.includes('invoicePaymentSummary'));
  assert.ok(docs.includes('Partially Paid'));
  assert.ok(docs.includes('Overdue'));
});

test('payment UI is delivered in the current bundled offline shell without changing ledger invariants',async()=>{
  const [html,sw,build,css]=await Promise.all([
    read('index.html'),read('public/sw.js'),read('scripts/build.mjs'),read('src/styles/payments-v131.css')
  ]);
  assert.match(html,/href="\.\/styles\/payments-v131\.css"/);
  assert.match(html,/href="\.\/styles\/tailadmin-finance-v320\.css/);
  assert.ok(html.indexOf('performance-polish-v100.css')<html.indexOf('payments-v131.css'),
    'current TailAdmin finance design overrides the earlier performance style');
  assert.ok(html.indexOf('payments-v131.css')<html.indexOf('tailadmin-finance-v320.css'));
  assert.match(build,/const appBundleCss=styleParts\.join/);
  assert.match(build,/await writeFile\('dist\/styles\/app\.bundle\.css',appBundleCss\)/);
  assert.match(build,/sw=sw\.replace\(/);
  for(const asset of ['payments-v131.css','InvoicePaymentsPanel.js','lib/payments.js'])
    assert.ok(sw.includes(asset),'source PWA compatibility includes '+asset);
  assert.match(sw,/const CACHE = 'lourex-invoice-v314'/);
  assert.doesNotMatch(css,/\.invoice-page\s*\{/);
});
