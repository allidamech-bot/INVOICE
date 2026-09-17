import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectProductImportMatrix, initialProductImportMapping, applyProductImportMapping } from '../dist/src/lib/product-import-mapping.js';
import { importableProducts, planProductImport } from '../dist/src/lib/product-import.js';

const read=path=>readFile(path,'utf8');

test('v258 inspects supplier sheets and exposes editable column mappings',()=>{
  const matrix=[
    ['Supplier catalogue 2026','','','',''],
    ['Article','Name','Unit EURO EXW','Case Qty','Made In'],
    ['MARS-50','Mars 50g','12.40','24','Netherlands']
  ];
  const inspection=inspectProductImportMatrix(matrix);
  assert.equal(inspection.headerIndex,1);
  assert.equal(inspection.columns.length,5);
  const mapping=initialProductImportMapping(inspection);
  const byHeader=new Map(inspection.columns.map(column=>[column.header,mapping[column.index]]));
  assert.equal(byHeader.get('Unit EURO EXW'),'lastUnitPrice');
  assert.equal(byHeader.get('Name'),'descriptionEn');
});

test('v258 manual mapping converts arbitrary supplier headings into the canonical importer',()=>{
  const matrix=[
    ['Internal supplier export','','',''],
    ['ARTICLE REF','ITEM TITLE','COMMERCIAL VALUE','BOX INFO'],
    ['A-100','Sample Product','22.75','12 pcs / carton']
  ];
  const inspection=inspectProductImportMatrix(matrix);
  const columns=new Map(inspection.columns.map(column=>[column.header,column.index]));
  const mapping={
    [columns.get('ARTICLE REF')]:'sku',
    [columns.get('ITEM TITLE')]:'descriptionEn',
    [columns.get('COMMERCIAL VALUE')]:'lastUnitPrice',
    [columns.get('BOX INFO')]:'packing'
  };
  const mapped=applyProductImportMapping(matrix,inspection,mapping);
  const plan=planProductImport(mapped,[],'EUR',true);
  assert.deepEqual(plan.counts,{create:1,update:0,skip:0,error:0});
  const item=importableProducts(plan)[0];
  assert.equal(item.sku,'A-100');
  assert.equal(item.descriptionEn,'Sample Product');
  assert.equal(item.lastUnitPrice,'22.75');
  assert.equal(item.lastCurrency,'EUR');
  assert.equal(item.packing,'12 pcs / carton');
});

test('v258 importer UI exposes mapping review and keeps dark contrast layer late',async()=>{
  const [modal,css,index]=await Promise.all([
    read('src/components/ProductImportModal.tsx'),
    read('src/styles/product-import-universal-v258.css'),
    read('index.html')
  ]);
  assert.match(modal,/type ImportStage='pick'\|'map'\|'preview'\|'importing'\|'done'/);
  assert.match(modal,/Confirm what each source column means/);
  assert.match(modal,/Ignore this column/);
  assert.match(modal,/Edit mapping/);
  assert.match(modal,/applyProductImportMapping/);
  assert.match(css,/product-import-map-row/);
  assert.match(css,/product-library-row-title strong/);
  assert.match(css,/color:var\(--ds-text\)!important/);
  const v257=index.indexOf('./styles/product-library-contrast-v257.css');
  const v258=index.indexOf('./styles/product-import-universal-v258.css');
  const document=index.indexOf('./styles/document-premium-redesign-v141.css');
  assert.ok(v257>=0&&v258>v257&&document>v258);
});
