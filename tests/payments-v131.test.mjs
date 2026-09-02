import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(path,'utf8');

test('v131 stores payments as first-class encrypted vault records',async()=>{const [types,defaults,merge,vault]=await Promise.all([read('src/types.ts'),read('src/lib/defaults.ts'),read('src/storage/vault-merge.ts'),read('src/storage/vault.ts')]);assert.match(types,/interface PaymentRecord/);assert.match(types,/payments: PaymentRecord[]/);assert.match(defaults,/APP_SCHEMA_VERSION = 7/);assert.match(defaults,/payments: []/);assert.match(merge,/payments:mergeRecords/);assert.match(vault,/unique(migrated.payments.map/);});

test('v131 enforces collection invariants and overpayment protection',async()=>{const [payments,app]=await Promise.all([read('src/lib/payments.ts'),read('src/app/App.tsx')]);assert.match(payments,/Payment cannot exceed the remaining invoice balance/);assert.match(payments,/Invoice total cannot be reduced below the amount already paid/);assert.match(payments,/Invoice currency cannot change after a payment is recorded/);assert.match(payments,/Invoice customer cannot change after a payment is recorded/);assert.match(app,/assertInvoicePaymentInvariant(updated,vault.payments)/);assert.match(app,/Delete the invoice payments before deleting this invoice/);});

test('v131 exposes full and partial receipt workflow with collection status',async()=>{const [panel,docs]=await Promise.all([read('src/components/InvoicePaymentsPanel.tsx'),read('src/components/DocumentsPage.tsx')]);for(const term of ['Record Payment','Amount','Date','Method','Reference','Notes','Payment history'])assert.match(panel,new RegExp(term));assert.match(panel,/summary.remaining/);assert.match(docs,/invoicePaymentSummary/);assert.match(docs,/Partially Paid/);assert.match(docs,/Overdue/);});

test('v131 payment UI stays offline and performance layer remains last',async()=>{const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);assert.match(html,/payments-v131.css/);assert.ok(html.indexOf('payments-v131.css')<html.indexOf('performance-polish-v100.css'));assert.match(sw,/payments-v131.css/);assert.match(sw,/InvoicePaymentsPanel.js/);assert.match(sw,/lib/payments.js/);assert.match(sw,/const CACHE = 'lourex-invoice-v131'/);});
