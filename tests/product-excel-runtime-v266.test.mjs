import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('v266 product Excel import uses the vendored XLSX runtime in production and offline cache',async()=>{
  const runtime=await read('dist/src/lib/spreadsheet-reader.js');
  const sw=await read('dist/sw.js');
  assert.match(runtime,/\.\/vendor\/xlsx\.full\.min\.js/);
  assert.doesNotMatch(runtime,/https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx@/);
  assert.ok(sw.includes('vendor/xlsx.full.min.js'));
});

test('v266 product import keeps explicit sale-price and purchase-cost mappings',async()=>{
  const modal=await read('src/components/ProductImportModal.tsx');
  const importer=await read('src/lib/product-import.ts');
  assert.match(modal,/value:'lastUnitPrice'/);
  assert.match(modal,/value:'lastUnitCost'/);
  assert.match(modal,/Sale price/);
  assert.match(modal,/Purchase cost/);
  assert.match(importer,/lastUnitPrice/);
  assert.match(importer,/lastUnitCost/);
  assert.match(importer,/decimalToScaled\(incoming\.lastUnitCost,12\)<0n/);
});
