import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault, APP_SCHEMA_VERSION } from '../dist/src/lib/defaults.js';
import { migrateVault } from '../dist/src/storage/vault.js';
import { importableProducts, parseCsvMatrix, planProductImport } from '../dist/src/lib/product-import.js';
import { findSavedItemDuplicate, normalizeSavedItemSku, savedItemSearchText } from '../dist/src/lib/saved-items.js';

const read=path=>readFile(path,'utf8');
const saved=(id,sku,name,overrides={})=>({
  id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',lastUsedAt:'2026-01-01T00:00:00.000Z',
  sku,descriptionEn:name,descriptionAr:'',hsCode:'',origin:'Türkiye',packing:'24 × 250 ml / Carton',unit:'Carton',lastUnitPrice:'20',lastCurrency:'USD',usageCount:2,category:'Beverages',tags:['250ml'],favorite:true,...overrides
});

test('v113 makes SKU a normalized searchable product identity',()=>{
  const item=saved('p1',' rb-250-org ','Red Bull 250ml');
  assert.equal(normalizeSavedItemSku(item.sku),'RB-250-ORG');
  assert.match(savedItemSearchText(item),/rb-250-org/);
  assert.equal(findSavedItemDuplicate([item],saved('p2','RB-250-ORG','Different name'))?.id,'p1');
});

test('v113 CSV parser keeps commas, quotes and multiline-safe cells intact',()=>{
  const matrix=parseCsvMatrix('SKU,Description EN,Tags\r\nA-1,"Juice, Orange","250ml, Juice"\r\nA-2,"Say ""Hello""",Test');
  assert.deepEqual(matrix[0],['SKU','Description EN','Tags']);
  assert.equal(matrix[1][1],'Juice, Orange');
  assert.equal(matrix[1][2],'250ml, Juice');
  assert.equal(matrix[2][1],'Say "Hello"');
});

test('v113 import plan updates by SKU without blank cells erasing saved product data',()=>{
  const existing=saved('p1','RB-250-ORG','Red Bull Original',{descriptionAr:'ريد بول',hsCode:'220299',lastUnitPrice:'24.50'});
  const matrix=[['SKU','Description EN','HS Code','Unit Price','Currency'],['RB-250-ORG','','','26.75','USD']];
  const plan=planProductImport(matrix,[existing],'USD',true);
  assert.deepEqual(plan.counts,{create:0,update:1,skip:0,error:0});
  const updated=importableProducts(plan)[0];
  assert.equal(updated.id,'p1');
  assert.equal(updated.descriptionEn,'Red Bull Original');
  assert.equal(updated.descriptionAr,'ريد بول');
  assert.equal(updated.hsCode,'220299');
  assert.equal(updated.lastUnitPrice,'26.75');
});

test('v113 import plan creates new products and blocks ambiguous or invalid rows',()=>{
  const existing=saved('p1','A-1','Existing');
  const matrix=[
    ['SKU','Description EN','Unit Price'],
    ['NEW-1','New Product','12.5'],
    ['NEW-1','Repeated Product','13'],
    ['','No SKU Bad Price','-1'],
    ['ONLY-SKU','','10']
  ];
  const plan=planProductImport(matrix,[existing],'SAR',true);
  assert.equal(plan.counts.create,1);
  assert.equal(plan.counts.error,3);
  const created=importableProducts(plan)[0];
  assert.equal(created.sku,'NEW-1');
  assert.equal(created.lastCurrency,'SAR');
});

test('v113 import preview blocks duplicate names even when file SKUs differ',()=>{
  const matrix=[
    ['SKU','Description EN','Unit Price'],
    ['NEW-1','Same Product','10'],
    ['NEW-2','Same Product','11']
  ];
  const plan=planProductImport(matrix,[],'USD',true);
  assert.deepEqual(plan.counts,{create:1,update:0,skip:0,error:1});
  assert.match(plan.rows[1].reason,/Duplicate product name/);
});

test('v113 can preview existing products as skipped when updates are disabled',()=>{
  const existing=saved('p1','A-1','Existing');
  const plan=planProductImport([['SKU','Unit Price'],['A-1','22']],[existing],'USD',false);
  assert.deepEqual(plan.counts,{create:0,update:0,skip:1,error:0});
  assert.equal(importableProducts(plan).length,0);
});

test('legacy schema preserves SKU and all modern saved-item metadata through current migration',()=>{
  assert.ok(APP_SCHEMA_VERSION>=6);
  const vault=emptyVault();
  vault.schemaVersion=5;
  vault.savedItems=[saved('p1','SKU-100','Product',{category:'Energy Drinks',tags:['250ml','Original'],favorite:true})];
  const migrated=migrateVault(vault);
  assert.equal(migrated.schemaVersion,APP_SCHEMA_VERSION);
  assert.equal(migrated.savedItems[0].sku,'SKU-100');
  assert.equal(migrated.savedItems[0].category,'Energy Drinks');
  assert.deepEqual(migrated.savedItems[0].tags,['250ml','Original']);
  assert.equal(migrated.savedItems[0].favorite,true);
});

test('v113 Product Library Pro exposes SKU, duplicate, dirty-state protection and guarded Excel/CSV import',async()=>{
  const [page,workspace,importer]=await Promise.all([
    read('src/components/SavedItemsPage.tsx'),
    read('src/components/ProductLibraryWorkspace.tsx'),
    read('src/components/ProductImportModal.tsx')
  ]);
  assert.match(page,/ProductLibraryWorkspace/);
  assert.match(workspace,/SKU \/ Item Code/);
  assert.match(workspace,/icon="copy"/);
  assert.match(workspace,/Duplicate/);
  assert.match(workspace,/editingDirty/);
  assert.match(workspace,/Discard unsaved product changes/);
  assert.match(workspace,/requestImport/);
  assert.match(workspace,/ProductImportModal/);
  assert.match(importer,/\.xlsx/);
  assert.match(importer,/\.xls/);
  assert.match(importer,/\.csv/);
  assert.match(importer,/planProductImport/);
  assert.match(importer,/Preview first/);
  assert.match(importer,/onSaveMany:\(items:SavedItem\[\]\)=>Promise<void>/);
  assert.match(importer,/await this\.props\.onSaveMany\(products\)/);
  assert.doesNotMatch(importer,/for\(const item of products\)/);
  assert.match(importer,/One secure write/);
  assert.match(importer,/Fix file errors first/);
});

test('favorite toggles on the actively edited product stay in the unsaved editor snapshot',async()=>{
  const workspace=await read('src/components/ProductLibraryWorkspace.tsx');
  assert.match(workspace,/if\(editing\?\.id===item\.id\)\{this\.set\('favorite',!Boolean\(editing\.favorite\)\);return;\}/);
  assert.match(workspace,/const rowFavorite=active\?Boolean\(edit\?\.favorite\):Boolean\(item\.favorite\)/);
  assert.match(workspace,/aria-pressed=\{rowFavorite\}/);
});

test('v113 stays app-only, offline capable and keeps the performance layer last',async()=>{
  const [css,index,sw]=await Promise.all([read('src/styles/product-library-pro-v113.css'),read('index.html'),read('public/sw.js')]);
  assert.match(css,/\.app-ui \.product-library-pro/);
  assert.match(css,/product-import-table/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/@media \(pointer:coarse\)/);
  assert.doesNotMatch(css,/\.invoice-page|\.items-table|\.doc-header|\.totals-block/);
  const pro='./styles/product-library-pro-v113.css';
  const perf='./styles/performance-polish-v100.css';
  assert.ok(index.indexOf(pro)>-1&&index.indexOf(pro)<index.indexOf(perf));
  for(const asset of ['./styles/product-library-pro-v113.css','./src/components/ProductLibraryWorkspace.js','./src/components/ProductImportModal.js','./src/lib/product-import.js'])assert.ok(sw.includes(asset),asset);
  assert.match(sw,/xlsx@0\.18\.5\/dist\/xlsx\.full\.min\.js/);
  assert.match(sw,/v113/);
  assert.match(sw,/v112/);
  assert.match(sw,/v111/);
  assert.match(sw,/v103/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v101'/);
});
