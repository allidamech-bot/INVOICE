import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_SCHEMA_VERSION, emptyVault } from '../dist/src/lib/defaults.js';
import { savedItemFromDocumentItem, documentItemFromSavedItem, sortSavedItems } from '../dist/src/lib/saved-items.js';
import { migrateVault } from '../dist/src/storage/vault.js';

test('saved item round-trip keeps reusable commercial fields',()=>{
  const source={id:'item-1',descriptionEn:'Red Bull 250ml',descriptionAr:'ريد بول 250 مل',hsCode:'2202',origin:'Austria',packing:'24 cans / carton',quantity:'12',unit:'Carton',unitPrice:'24.50'};
  const saved=savedItemFromDocumentItem(source,'USD');
  assert.equal(saved.descriptionEn,'Red Bull 250ml');
  assert.equal(saved.lastUnitPrice,'24.50');
  assert.equal(saved.lastCurrency,'USD');
  const restored=documentItemFromSavedItem(saved);
  assert.equal(restored.descriptionAr,source.descriptionAr);
  assert.equal(restored.hsCode,'2202');
  assert.equal(restored.unit,'Carton');
  assert.equal(restored.quantity,'1');
});

test('saved item updates retain identity and increase usage',()=>{
  const source={id:'item-1',descriptionEn:'Monster 500ml',descriptionAr:'',hsCode:'',origin:'',packing:'',quantity:'1',unit:'Carton',unitPrice:'15'};
  const first=savedItemFromDocumentItem(source,'USD');
  const second=savedItemFromDocumentItem({...source,unitPrice:'16'},'USD',first);
  assert.equal(second.id,first.id);
  assert.equal(second.lastUnitPrice,'16');
  assert.equal(second.usageCount,first.usageCount+1);
  assert.equal(sortSavedItems([first,second])[0].usageCount,second.usageCount);
});

test('schema v2 migrates to smart defaults and encrypted saved-item collection',()=>{
  const old=emptyVault();
  old.schemaVersion=2;
  old.company.defaultCurrency='SAR';
  old.company.defaultLanguage='ar';
  old.company.defaultIncoterm='CIF';
  delete old.appSettings.smartDefaults;
  delete old.savedItems;
  const migrated=migrateVault(old);
  assert.equal(migrated.schemaVersion,APP_SCHEMA_VERSION);
  assert.equal(migrated.appSettings.smartDefaults.currency,'SAR');
  assert.equal(migrated.appSettings.smartDefaults.language,'ar');
  assert.equal(migrated.appSettings.smartDefaults.incoterm,'CIF');
  assert.deepEqual(migrated.savedItems,[]);
});
