import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v195 payment UI uses synchronous single-flight guards for save and delete',async()=>{
  const panel=await read('src/components/InvoicePaymentsPanel.tsx');
  assert.match(panel,/private saveInFlight=false;/);
  assert.match(panel,/private deleteInFlight=false;/);
  assert.match(panel,/if\(this\.saveInFlight\|\|this\.deleteInFlight\)return;/);
  assert.match(panel,/this\.saveInFlight=true;/);
  assert.match(panel,/finally\{this\.saveInFlight=false;\}/);
  assert.match(panel,/if\(this\.deleteInFlight\|\|this\.saveInFlight\)return;/);
  assert.match(panel,/this\.deleteInFlight=true;/);
  assert.match(panel,/finally\{this\.deleteInFlight=false;this\.setState\(\{deletingId:''\}\);\}/);
});

test('v195 payment browser workflow covers duplicate intent, retry, credit balance and RTL recovery',async()=>{
  const [runner,fixture,ci]=await Promise.all([
    read('tests/visual/run-functional-payments.cjs'),
    read('tests/visual/functional-payments.html'),
    read('.github/workflows/ci.yml')
  ]);
  for(const marker of [
    'payment-save-single-flight',
    'payment-save-error-retry',
    'net-balance-guard-with-credit-note',
    'payment-delete-single-flight',
    'arabic-payment-recovery'
  ])assert.ok(runner.includes(marker),marker);
  assert.match(runner,/rapid Save Payment clicks must create one persistence request/);
  assert.match(runner,/over-collection attempt must not create a payment/);
  assert.match(runner,/rapid Delete clicks must create one destructive request/);
  assert.match(fixture,/normalizePaymentRecord/);
  assert.match(fixture,/invoicePaymentSummary/);
  assert.match(ci,/node tests\/visual\/run-functional-payments\.cjs/);
});

test('v195 publishes a fresh immutable PWA generation and preserves v194 as a migration marker',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/v195 payment collection hardening/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v195';$/m);
  assert.match(sw,/lourex-invoice-v194: preserved as a legacy marker/);
  assert.ok(sw.includes('./src/components/InvoicePaymentsPanel.js'));
});
