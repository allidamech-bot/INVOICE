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

test('proforma and invoice numbering are independent and monotonic', () => {
  let vault = emptyVault();
  const a = nextDocumentNumber(vault, 'proforma'); vault = a.vault;
  const b = nextDocumentNumber(vault, 'proforma'); vault = b.vault;
  const c = nextDocumentNumber(vault, 'invoice'); vault = c.vault;
  assert.match(a.number, /^PI-\d{4}-0001$/);
  assert.match(b.number, /^PI-\d{4}-0002$/);
  assert.match(c.number, /^INV-\d{4}-0001$/);
  assert.equal(vault.appSettings.numbering.proformaLast, 2);
  assert.equal(vault.appSettings.numbering.invoiceLast, 1);
});

test('generated numbering falls back from blank prefixes and skips existing collisions', () => {
  const year = new Date().getFullYear();
  let vault = emptyVault();
  vault.appSettings.numbering.proformaPrefix = '';
  const quote = nextDocumentNumber(vault, 'proforma');
  assert.equal(quote.number, `PI-${year}-0001`);
  assert.equal(quote.vault.appSettings.numbering.proformaPrefix, 'PI');

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
  const doc = createBlankDocument('proforma', 'PI-2026-0001', company);
  const source = customer({ addressEn: 'Old Customer Address' }); doc.customerSnapshot = customerSnapshotFrom(source);
  company.addressEn = 'New Company Address'; source.addressEn = 'New Customer Address';
  assert.equal(doc.companySnapshot.addressEn, 'Old Company Address');
  assert.equal(doc.customerSnapshot.addressEn, 'Old Customer Address');
});

test('duplicate and conversion preserve content while producing independent identity', () => {
  const source = createBlankDocument('proforma', 'PI-2026-0001', defaultCompany()); source.customerSnapshot = customerSnapshotFrom(customer());
  source.items[0].descriptionEn = 'Red Bull Energy Drink Original 250ml'; source.items[0].quantity = '10'; source.items[0].unitPrice = '24.50';
  const dup = duplicateDocument(source, 'PI-2026-0002'); assert.notEqual(dup.id, source.id); assert.notEqual(dup.items[0].id, source.items[0].id); assert.equal(dup.items[0].descriptionEn, source.items[0].descriptionEn);
  source.status='final';
  const inv = convertToInvoice(source, 'INV-2026-0001'); assert.equal(inv.kind, 'invoice'); assert.equal(inv.convertedFromId, source.id); assert.equal(source.kind, 'proforma');
});

test('validation enforces minimum viable document and explicit item pricing', () => {
  const doc = createBlankDocument('invoice', 'INV-2026-0001', defaultCompany());
  let errors = validateDocument(doc);
  assert.ok(errors.customer);
  assert.ok(errors['item-0-description']);
  assert.ok(errors['item-0-price']);

  doc.customerSnapshot = customerSnapshotFrom(customer());
  doc.items[0].descriptionEn = 'Monster Energy Drink 500ml';
  doc.items[0].quantity = '0';
  errors = validateDocument(doc);
  assert.ok(errors['item-0-quantity']);
  assert.ok(errors['item-0-price']);

  doc.items[0].quantity = '1';
  doc.items[0].unitPrice = '12.50';
  errors = validateDocument(doc);
  assert.equal(Object.keys(errors).length, 0);
});

test('document readiness rises to 100 only when required commercial data is complete', () => {
  const doc = createBlankDocument('proforma', 'PI-2026-0001', defaultCompany());
  const initial = getDocumentReadiness(doc);
  assert.ok(initial.percent < 100);
  assert.equal(initial.ready, false);
  assert.ok(initial.remaining > 0);

  doc.customerSnapshot = customerSnapshotFrom(customer());
  doc.items[0].descriptionEn = 'Energy drink 250ml';
  doc.items[0].unitPrice = '10.00';
  const ready = getDocumentReadiness(doc);
  assert.equal(ready.percent, 100);
  assert.equal(ready.remaining, 0);
  assert.equal(ready.ready, true);
  assert.ok(ready.groups.every(group => group.complete));
});

test('bilingual documents require both item descriptions', () => {
  const doc = createBlankDocument('proforma', 'PI-2026-0001', defaultCompany());
  doc.customerSnapshot = customerSnapshotFrom(customer());
  doc.language = 'bilingual';
  doc.items[0].descriptionEn = 'Energy drink 250ml';
  doc.items[0].descriptionAr = '';
  doc.items[0].unitPrice = '10.00';
  let errors = validateDocument(doc);
  assert.ok(errors['item-0-description-ar']);
  doc.items[0].descriptionAr = 'مشروب طاقة 250 مل';
  errors = validateDocument(doc);
  assert.equal(Object.keys(errors).length, 0);
});

test('pagination handles 30+ items and preserves all rows', () => {
  const doc = createBlankDocument('proforma', 'PI-2026-0001', defaultCompany());
  const items = Array.from({ length: 35 }, (_, i) => ({ ...structuredClone(doc.items[0]), id: `item-${i}`, descriptionEn: `Trade item ${i + 1} with a normal commercial description` }));
  const pages = paginateItems(items); assert.ok(pages.length >= 3); assert.equal(pages.flat().length, 35); assert.ok(pages[0].length <= 10); assert.ok(pages.slice(1).every(page => page.length <= 13));
});

test('PIN verifier rejects wrong PIN and encrypted vault round-trips', async () => {
  const vault = emptyVault(); vault.company.nameEn = 'LOUREX'; const { metadata, key } = await createSecurity('2468');
  await assert.rejects(() => verifyPin('0000', metadata), /Wrong PIN/); const verified = await verifyPin('2468', metadata); const record = await encryptVault(verified, vault); assert.ok(!record.cipher.includes('LOUREX'));
  const restored = await decryptVault(verified, record); assert.equal(restored.company.nameEn, 'LOUREX'); assert.equal(restored.schemaVersion, vault.schemaVersion); assert.ok(key);
});

test('backup is encrypted, validates PIN, and restores complete payload', async () => {
  const vault = emptyVault(); vault.customers.push(customer()); const backup = await createEncryptedBackup('1357', vault); const serialized = JSON.stringify(backup); assert.ok(!serialized.includes('ABC Trading Company'));
  await assert.rejects(() => decryptBackup('9999', backup), /incorrect|corrupted/i); const restored = await decryptBackup('1357', backup); assert.equal(restored.customers[0].companyNameEn, 'ABC Trading Company');
});

test('backup decryption rejects abusive or malformed crypto parameters without unbounded KDF work', async () => {
  const backup = await createEncryptedBackup('1357', emptyVault());
  const hostile = structuredClone(backup);
  hostile.kdf.iterations = 2_000_001;
  await assert.rejects(() => decryptBackup('1357', hostile), /incorrect|corrupted/i);
  const malformed = structuredClone(backup);
  malformed.cipher.iv = 'not-valid-base64';
  await assert.rejects(() => decryptBackup('1357', malformed), /incorrect|corrupted/i);
  const weak = structuredClone(backup);
  weak.kdf.iterations = 1;
  await assert.rejects(() => decryptBackup('1357', weak), /incorrect|corrupted/i);
});

test('migration rejects duplicate IDs instead of silently corrupting restored data', async () => {
  const { migrateVault } = await import('../dist/src/storage/vault.js'); const vault = emptyVault(); const first = customer({ id: 'duplicate-id' }); vault.customers = [first, { ...structuredClone(first) }]; assert.throws(() => migrateVault(vault), /duplicate or invalid customer IDs/i);
});