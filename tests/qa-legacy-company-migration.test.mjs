import test from 'node:test';
import assert from 'node:assert/strict';
import {APP_SCHEMA_VERSION,emptyVault} from '../dist/src/lib/defaults.js';
import {migrateVault} from '../dist/src/storage/vault.js';

test('schema v19 recovers original company and smart defaults rather than using a stale workspace directory',()=>{
  const original=emptyVault();
  original.schemaVersion=19;
  original.company.nameEn='Historic Merchant';
  original.company.defaultCurrency='SAR';
  original.appSettings.smartDefaults.currency='SAR';
  original.appSettings.smartDefaults.language='ar';
  // An imported old vault can contain a synthetic directory created by a newer
  // utility. That directory must not replace pre-v20 company-level metadata.
  assert.notEqual(original.workspaces[0].company.nameEn,original.company.nameEn);
  const restored=migrateVault(original);
  assert.equal(restored.schemaVersion,APP_SCHEMA_VERSION);
  assert.equal(restored.company.nameEn,'Historic Merchant');
  assert.equal(restored.company.defaultCurrency,'SAR');
  assert.equal(restored.appSettings.smartDefaults.currency,'SAR');
  assert.equal(restored.appSettings.smartDefaults.language,'ar');
  assert.equal(restored.workspaces[0].company.nameEn,'Historic Merchant');
  assert.equal(restored.workspaces[0].smartDefaults.currency,'SAR');
});

test('schema v20 and newer preserves the actual selected workspace and its boundaries',()=>{
  const original=emptyVault();
  original.schemaVersion=20;
  original.company.nameEn='Unpersisted top-level stale text';
  original.workspaces[0].company.nameEn='Canonical Workspace Merchant';
  const restored=migrateVault(original);
  assert.equal(restored.company.nameEn,'Canonical Workspace Merchant');
  assert.equal(restored.workspaces[0].company.nameEn,'Canonical Workspace Merchant');
});
