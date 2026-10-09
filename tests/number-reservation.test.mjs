import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { nextDocumentNumber } from '../dist/src/lib/documents.js';

test('overlapping document actions cannot reserve the same number from one stale vault snapshot',()=>{
  const stale=emptyVault();
  const first=nextDocumentNumber(stale,'invoice');
  const second=nextDocumentNumber(stale,'invoice');
  assert.notEqual(first.number,second.number);
  assert.match(first.number,/INV-\d{4}-0001$/);
  assert.match(second.number,/INV-\d{4}-0002$/);
});

test('quotation, proforma invoice and commercial invoice reservations remain independent',()=>{
  const stale=emptyVault();
  const quote1=nextDocumentNumber(stale,'proforma');
  const proformaInvoice1=nextDocumentNumber(stale,'proforma-invoice');
  const invoice1=nextDocumentNumber(stale,'invoice');
  const quote2=nextDocumentNumber(stale,'proforma');
  const proformaInvoice2=nextDocumentNumber(stale,'proforma-invoice');
  const invoice2=nextDocumentNumber(stale,'invoice');
  // Quotation (QUO), Proforma Invoice (PI), Invoice (INV) are distinct commercial document kinds.
  assert.match(quote1.number,/^QUO-\d{4}-0001$/);
  assert.match(quote2.number,/^QUO-\d{4}-0002$/);
  assert.match(proformaInvoice1.number,/^PI-\d{4}-0001$/);
  assert.match(proformaInvoice2.number,/^PI-\d{4}-0002$/);
  assert.match(invoice1.number,/^INV-\d{4}-0001$/);
  assert.match(invoice2.number,/^INV-\d{4}-0002$/);
  assert.equal(new Set([quote1.number,quote2.number,proformaInvoice1.number,proformaInvoice2.number,invoice1.number,invoice2.number]).size,6,'no cross-document number collision');
});
