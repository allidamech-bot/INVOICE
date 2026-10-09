import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_SCHEMA_VERSION, emptyVault } from '../dist/src/lib/defaults.js';
import { getDocumentReadiness } from '../dist/src/lib/readiness.js';
import { documentQualityIssues } from '../dist/src/lib/document-quality.js';
import { migrateVault } from '../dist/src/storage/vault.js';

test('legacy saved documents are fully normalized before the editor opens', () => {
  const legacy = emptyVault();
  legacy.schemaVersion = 3;
  legacy.company = {
    ...legacy.company,
    nameEn: 'LOUREX',
    bank: { bankName: 'Current Bank' }
  };
  legacy.appSettings.smartDefaults = {
    currency: 'USD',
    language: 'en',
    incoterm: '',
    paymentTerms: '',
    deliveryTime: '',
    quoteTemplateId: 'executive',
    invoiceTemplateId: 'executive'
  };
  legacy.documents = [{
    id: 'doc-legacy',
    kind: 'proforma',
    number: 'PI-2026-0001',
    issueDate: '2026-08-20',
    dueDate: '2026-08-27',
    currency: 'USD',
    language: 'en',
    customerSnapshot: { sourceCustomerId: 'cust-legacy', companyNameEn: 'Legacy Buyer' },
    companySnapshot: { nameEn: 'LOUREX' },
    items: [{ id: 'item-legacy', descriptionEn: 'Legacy item', quantity: 1, unit: 'Carton', unitPrice: 10 }],
    terms: { paymentTerms: 'Cash' },
    adjustments: {},
    notes: '',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z'
  }];

  const migrated = migrateVault(legacy);
  const doc = migrated.documents[0];

  assert.equal(migrated.schemaVersion, APP_SCHEMA_VERSION);
  assert.equal(doc.status, 'draft');
  assert.equal(doc.appearance.templateId, 'executive');
  assert.equal(typeof doc.companySnapshot.logoDataUrl, 'string');
  assert.equal(doc.companySnapshot.bank.bankName, '');
  assert.equal(typeof doc.companySnapshot.bank.iban, 'string');
  assert.notEqual(doc.companySnapshot.bank.bankName, migrated.company.bank.bankName);
  assert.equal(doc.items[0].quantity, '1');
  assert.equal(doc.items[0].unitPrice, '10');
  assert.equal(doc.items[0].descriptionAr, '');
  assert.equal(doc.terms.incoterm, '');
  assert.equal(doc.adjustments.discountEnabled, false);
  assert.deepEqual(migrated.appSettings.smartDefaults.favoriteTemplateIds, []);

  assert.doesNotThrow(() => getDocumentReadiness(doc));
  assert.doesNotThrow(() => documentQualityIssues(doc));
});


test('pre-v20 backups preserve top-level company identity even if a placeholder workspace is present',()=>{
  const legacy=emptyVault();
  legacy.schemaVersion=19;
  legacy.company={...legacy.company,nameEn:'Historical Trading Co',
    bank:{...legacy.company.bank,bankName:'Historical Bank',iban:'TR000000000000000000001',currency:'TRY'}};
  legacy.appSettings.smartDefaults={...legacy.appSettings.smartDefaults,language:'ar'};
  legacy.workspaces=[{...legacy.workspaces[0],company:{...legacy.workspaces[0].company,nameEn:''}}];
  const migrated=migrateVault(legacy);
  assert.equal(migrated.company.nameEn,'Historical Trading Co');
  assert.equal(migrated.company.bank.bankName,'Historical Bank');
  assert.equal(migrated.company.bank.iban,'TR000000000000000000001');
  assert.equal(migrated.company.bank.currency,'TRY');
  assert.equal(migrated.workspaces[0].company.nameEn,'Historical Trading Co');
  assert.equal(migrated.workspaces[0].company.bank.bankName,'Historical Bank');
  assert.equal(migrated.appSettings.smartDefaults.language,'ar');
});

test('v20 workspace-era backups still use the active workspace company as authority',()=>{
  const legacy=emptyVault();
  legacy.schemaVersion=20;
  legacy.company.nameEn='Outdated projected company';
  legacy.workspaces[0].company.nameEn='Active Workspace Company';
  const migrated=migrateVault(legacy);
  assert.equal(migrated.company.nameEn,'Active Workspace Company');
  assert.equal(migrated.workspaces[0].company.nameEn,'Active Workspace Company');
});
