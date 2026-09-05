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
  assert.ok(payments.includes('Invoice balance after credit notes cannot fall below the amount already paid.'));
  assert.ok(payments.includes('Invoice currency cannot change after a payment is recorded.'));
  assert.ok(payments.includes('Invoice customer cannot change after a payment is recorded.'));
  assert.ok(app.includes('assertInvoicePaymentInvariant(updated,vault.payments,vault.documents)'));
  assert.ok(app.includes('Delete the invoice payments before deleting this invoice.'));
});

test('v131 exposes full and partial receipt workflow with collection status',async()=>{
  const [panel,docs]=await Promise.all([read('src/components/InvoicePaymentsPanel.tsx'),read('src/components/DocumentsPage.tsx')]);
  for(const term of ['Record Payment','Amount','Date','Method','Reference','Notes','Payment history'])assert.ok(panel.includes(term),term);
  assert.ok(panel.includes('summary.remaining'));
  assert.ok(docs.includes('invoicePaymentSummary'));
  assert.ok(docs.includes('Partially Paid'));
  assert.ok(docs.includes('Overdue'));
});

test('v131 payment UI stays offline and performance layer remains last',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  assert.ok(html.includes('payments-v131.css'));
  assert.ok(html.indexOf('payments-v131.css')<html.indexOf('performance-polish-v100.css'));
  assert.ok(sw.includes('payments-v131.css'));
  assert.ok(sw.includes('InvoicePaymentsPanel.js'));
  assert.ok(sw.includes('lib/payments.js'));
  assert.ok(sw.includes('lourex-invoice-v131'));
});
