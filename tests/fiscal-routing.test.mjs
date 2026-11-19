import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFiscalRoute } from '../dist/src/lib/fiscal-routing.js';

const profile = (issuerCountry, saRegime) => ({ issuerCountry, saRegime });

test('non-fiscal documents never enter the ZATCA submission path', () => {
  for (const kind of ['quote','proforma','proforma-invoice','rfq','purchase-order','delivery-note','payment-receipt','draft']) {
    assert.deepEqual(resolveFiscalRoute(kind, profile('SA','phase-2')), {route:'non-fiscal'});
  }
});
test('verified out-of-scope international issuers retain commercial routing', () => {
  for (const country of ['TR','SY','DE','SA']) {
    assert.deepEqual(resolveFiscalRoute('invoice', profile(country,'out-of-scope')), {route:'commercial'});
  }
});
test('unresolved or malformed issuer profiles fail closed for financial documents', () => {
  for (const issuer of [null,profile('SA','unresolved'),profile('SA','invalid'),profile('','phase-2'),profile('sa','out-of-scope')]) {
    for (const kind of ['invoice','credit-note','debit-note']) {
      assert.deepEqual(resolveFiscalRoute(kind, issuer, 'standard'), {route:'blocked',reason:'unresolved-issuer'});
    }
  }
});
test('Saudi generation phase is not falsely marked as integrated', () => {
  for (const invoiceType of ['standard','simplified']) {
    assert.deepEqual(resolveFiscalRoute('invoice',profile('SA','phase-1'),invoiceType), {route:'sa-generation',invoiceType});
  }
});
test('phase-two standard invoice and adjustment notes require clearance', () => {
  for (const kind of ['invoice','credit-note','debit-note']) {
    assert.deepEqual(resolveFiscalRoute(kind,profile('SA','phase-2'),'standard'), {route:'sa-clearance',invoiceType:'standard'});
  }
});
test('phase-two simplified invoice and adjustment notes require reporting', () => {
  for (const kind of ['invoice','credit-note','debit-note']) {
    assert.deepEqual(resolveFiscalRoute(kind,profile('SA','phase-2'),'simplified'), {route:'sa-reporting',invoiceType:'simplified'});
  }
});
test('issuer regime is not inferred from country or customer destination', () => {
  assert.equal(resolveFiscalRoute('invoice',profile('TR','phase-2'),'standard').route,'sa-clearance');
  assert.equal(resolveFiscalRoute('invoice',profile('SA','out-of-scope')).route,'commercial');
});
test('Saudi invoice type must be explicitly resolved', () => {
  for (const regime of ['phase-1','phase-2']) {
    for (const invoiceType of [undefined,'invalid']) {
      assert.deepEqual(resolveFiscalRoute('invoice',profile('SA',regime),invoiceType), {route:'blocked',reason:'unresolved-invoice-type'});
    }
  }
});
test('unsupported document kinds are not silently treated as commercial invoices', () => {
  assert.deepEqual(resolveFiscalRoute('unknown',profile('TR','out-of-scope')), {route:'blocked',reason:'unknown-document'});
});
