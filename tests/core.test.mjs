import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTotals, lineTotal } from '../dist/src/lib/money.js';
import { defaultCompany, emptyVault, customerSnapshotFrom } from '../dist/src/lib/defaults.js';
import { createBlankDocument, duplicateDocument, convertToInvoice, nextDocumentNumber, paginateItems, validateDocument } from '../dist/src/lib/documents.js';
import { getDocumentReadiness } from '../dist/src/lib/readiness.js';
import { createSecurity, verifyPin, encryptVault, decryptVault, createEncryptedBackup, decryptBackup } from '../dist/src/crypto/crypto.js';

function customer(overrides = {}) {
  return {
    id: 'cust-1', companyNameEn: 'ABC Trading Company', companyNameAr: '', contactPerson: 'Buyer',
    addressEn: 'Riyadh', addressAr: '', city: 'Riyadh', country: 'Saudi Arabia', phone: '+966500000000',
    email: 'buyer@example.com', vatTaxNumber: '123', commercialRegistration: '456', notes: '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...overrides
  };
}

test('financial arithmetic is fixed-precision and rounds to cents', () => {
  assert.equal(lineTotal('0.1', '0.2'), '0.02');
  assert.equal(lineTotal('3', '10.15'), '30.45');
  const totals = calculateTotals(
    [{ quantity: '2', unitPrice: '10.15' }, { quantity: '3', unitPrice: '5.10' }],
    { discountEnabled: true, discountMode: 'percent', discountValue: '10', shippingEnabled: true, shipping: '2', otherChargesEnabled: true, otherCharges: '1.50', taxEnabled: true, taxPercent: '15' }
  );
  assert.deepEqual(totals, { subtotal: '35.60', discount: '3.56', shipping: '2.00', otherCharges: '1.50', tax: '5.33', grandTotal: '40.87' });
});

test('quotation and invoice numbering are independent and monotonic', () => {
  let vault = emptyVault();
  const a = nextDocumentNumber(vault, 'proforma'); vault = a.vault;
  const b = nextDocumentNumber(vault, 'proforma'); vault = b.vault;
  const c = nextDocumentNumber(vault, 'invoice'); vault = c.vault;
  assert.match(a.number, /^QUO-\d{4}-0001$/);
  assert.match(b.number, /^QUO-\d{4}-0002$/);
  assert.match(c.number, /^INV-\d{4}-0001$/);
  assert.equal(vault.appSettings.numbering.proformaLast, 2);
  assert.equal(vault.appSettings.numbering.invoiceLast, 1);
});

test('generated numbering falls back from blank prefixes and skips existing collisions', () => {
  const year = new Date().getFullYear();
  let vault = emptyVault();
  vault.appSettings.numbering.proformaPrefix = '';
  const quote = nextDocumentNumber(vault, 'proforma');
  assert.equal(quote.number, `QUO-${year}-0001`);
  assert.equal(quote.vault.appSettings.numbering.proformaPrefix, 'QUO');

  vault = emptyVault();
  vault.appSettings.numbering.proformaPrefix = 'DOC';
  vault.appSettings.numbering.invoicePrefix = 'DOC';
  vault.documents.push(createBlankDocument('proforma', `DOC-${year}-0001`, defaultCompany()));
  const invoice = nextDocumentNumber(vault, 'invoice');
  assert.equal(invoice.number, `DOC-${year}-0002`);
  assert.equal(invoice.vault.appSettings.numbering.invoiceLast, 2);

  vault = emptyVault();
  vault.appSettings.numbering.invoiceLast = 4;
  vault.documents.push(createBlankDocument('invoice', `INV-${year}-0005`, defaultCompany()));
  const afterManualCollision = nextDocumentNumber(vault, 'invoice');
  assert.equal(afterManualCollision.number, `INV-${year}-0006`);
  assert.equal(afterManualCollision.vault.appSettings.numbering.invoiceLast, 6);
});

test('customer and company snapshots stay historical after source edits', () => {
  const company = defaultCompany(); company.addressEn = 'Old Company Address';
  const doc = createBlankDocument('proforma', 'QUO-2026-0001', company);
  const source = customer({ addressEn: 'Old Customer Address' }); doc.customerSnapshot = customerSnapshotFrom(source);
  company.addressEn = 'New Company Address'; source.addressEn = 'New Customer Address';
  assert.equal(doc.companySnapshot.addressEn, 'Old Company Address');
  assert.equal(doc.customerSnapshot.addressEn, 'Old Customer Address');
});

test('duplicate and conversion preserve content while producing independent identity', () => {
  const source = createBlankDocument('proforma', 'QUO-2026-0001', defaultCompany()); source.customerSnapshot = customerSnapshotFrom(customer());
  source.items[0].descriptionEn = 'Red Bull Energy Drink Original 250ml'; source.items[0].quantity = '10'; source.items[0].unitPrice = '24.50';
  const dup = duplicateDocument(source, 'QUO-2026-0002'); assert.notEqual(dup.id, source.id); assert.notEqual(dup.items[0].id, source.items[0].id); assert.equal(dup.items[0].descriptionEn, source.items[0].descriptionEn);
  source.status='final';
  const inv = convertToInvoice(source, 'INV-2026-0001'); assert.equal(inv.kind, 'invoice'); assert.equal(inv.convertedFromId, source.id); assert.equal(source.kind, 'proforma');
});

test('validation enforces minimum viable document and explicit item pricing', () => {
  const company = defaultCompany();
  const doc = createBlankDocument('invoice', 'INV-2026-0001', company);
  let errors = validateDocument(doc);
  assert.ok(errors.customer);
  assert.ok(errors['item-0-description']);
  assert.ok(errors['item-0-price']);
  doc.customerSnapshot = customerSnapshotFrom(customer());
  doc.items[0].descriptionEn = 'Item';
  doc.items[0].unitPrice = '0';
  errors = validateDocument(doc);
  assert.equal(Object.keys(errors).length, 0);
});

test('document readiness rises to 100 only when required commercial data is complete', () => {
  const doc = createBlankDocument('invoice', 'INV-2026-0002', defaultCompany());
  const initial = getDocumentReadiness(doc);
  assert.ok(initial.percent < 100);
  assert.ok(initial.remaining > 0);
  doc.customerSnapshot = customerSnapshotFrom(customer());
  doc.items[0].descriptionEn = 'Ready Item';
  doc.items[0].unitPrice = '12.50';
  const ready = getDocumentReadiness(doc);
  assert.equal(ready.percent, 100);
  assert.equal(ready.ready, true);
  assert.equal(ready.remaining, 0);
});

test('bilingual documents require both item descriptions', () => {
  const doc = createBlankDocument('invoice', 'INV-2026-0003', defaultCompany());
  doc.language = 'bilingual';
  doc.customerSnapshot = customerSnapshotFrom(customer());
  doc.items[0].descriptionEn = 'Only English';
  doc.items[0].unitPrice = '5';
  const errors = validateDocument(doc);
  assert.ok(errors['item-0-description-ar']);
});

test('pagination handles 30+ items and preserves all rows', () => {
  const doc = createBlankDocument('invoice', 'INV-2026-0004', defaultCompany());
  const base = doc.items[0];
  doc.items = Array.from({ length: 35 }, (_, i) => ({ ...base, id: `i-${i}`, descriptionEn: `Item ${i}`, unitPrice: '1' }));
  const pages = paginateItems(doc);
  assert.ok(pages.length >= 2);
  assert.equal(pages.flatMap(p => p.items).length, 35);
});

test('PIN verifier rejects wrong PIN and encrypted vault round-trips', async () => {
  const security = await createSecurity('123456');
  assert.equal(await verifyPin('000000', security), false);
  assert.equal(await verifyPin('123456', security), true);
  const vault = emptyVault(); vault.company.nameEn = 'LOUREX';
  const record = await encryptVault('123456', security, vault);
  const restored = await decryptVault('123456', record);
  assert.equal(restored.company.nameEn, 'LOUREX');
});

test('backup is encrypted, validates PIN, and restores complete payload', async () => {
  const vault = emptyVault(); vault.company.nameEn = 'LOUREX';
  const backup = await createEncryptedBackup('123456', vault);
  assert.equal(backup.includes('LOUREX'), false);
  await assert.rejects(() => decryptBackup('000000', backup));
  const restored = await decryptBackup('123456', backup);
  assert.equal(restored.company.nameEn, 'LOUREX');
});

test('backup decryption rejects abusive or malformed crypto parameters without unbounded KDF work', async () => {
  const backup = JSON.parse(await createEncryptedBackup('123456', emptyVault()));
  backup.kdf.iterations = 999999999;
  await assert.rejects(() => decryptBackup('123456', JSON.stringify(backup)), /Invalid backup security parameters/);
  backup.kdf.iterations = 210000;
  backup.kdf.salt = 'not-base64!!!';
  await assert.rejects(() => decryptBackup('123456', JSON.stringify(backup)), /Invalid backup format/);
});

test('migration rejects duplicate IDs instead of silently corrupting restored data', async () => {
  const backup = JSON.parse(await createEncryptedBackup('123456', emptyVault()));
  const raw = await decryptBackup('123456', JSON.stringify(backup));
  raw.customers = [customer({id:'dup'}), customer({id:'dup',companyNameEn:'Different'})];
  const duplicateBackup = await createEncryptedBackup('123456', raw);
  await assert.rejects(() => decryptBackup('123456', duplicateBackup), /Duplicate customer ID/);
});
