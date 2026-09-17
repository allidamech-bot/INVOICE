import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importableProducts, planProductImport } from '../dist/src/lib/product-import.js';

const read=path=>readFile(path,'utf8');

test('v257 finds the real spreadsheet header row and imports commercial product fields',()=>{
  const matrix=[
    ['Supplier catalogue 2026','','','','','','',''],
    ['Item Code','Product Name','Selling Price USD','Purchase Price USD','Pack Size','Country of Origin','HS Code','UOM'],
    ['MARS-50','Mars 50g','$1,234.50','900,25','24 pcs / carton','Türkiye','180690','Carton']
  ];
  const plan=planProductImport(matrix,[],'SAR',true);
  assert.deepEqual(plan.counts,{create:1,update:0,skip:0,error:0});
  assert.ok(plan.recognizedFields.includes('lastUnitPrice'));
  assert.ok(plan.recognizedFields.includes('lastUnitCost'));
  const item=importableProducts(plan)[0];
  assert.equal(item.sku,'MARS-50');
  assert.equal(item.descriptionEn,'Mars 50g');
  assert.equal(item.lastUnitPrice,'1234.50');
  assert.equal(item.lastCurrency,'USD');
  assert.equal(item.lastUnitCost,'900.25');
  assert.equal(item.lastCostCurrency,'USD');
  assert.equal(item.packing,'24 pcs / carton');
  assert.equal(item.origin,'Türkiye');
  assert.equal(item.hsCode,'180690');
  assert.equal(item.unit,'Carton');
});

test('v257 understands Arabic commercial headings and localized prices',()=>{
  const matrix=[
    ['كود الصنف','اسم المنتج','سعر البيع','التكلفة','بلد المنشأ','التعبئة','الوحدة'],
    ['A-1','منتج تجريبي','١٢٫٥٠','١٠,٢٥','السعودية','12 قطعة / كرتون','كرتون']
  ];
  const plan=planProductImport(matrix,[],'SAR',true);
  assert.deepEqual(plan.counts,{create:1,update:0,skip:0,error:0});
  const item=importableProducts(plan)[0];
  assert.equal(item.descriptionAr,'منتج تجريبي');
  assert.equal(item.lastUnitPrice,'12.50');
  assert.equal(item.lastUnitCost,'10.25');
  assert.equal(item.lastCurrency,'SAR');
  assert.equal(item.lastCostCurrency,'SAR');
});

test('v257 keeps imported catalogue text readable and loads the contrast layer late',async()=>{
  const [css,index,importer]=await Promise.all([
    read('src/styles/product-library-contrast-v257.css'),
    read('index.html'),
    read('src/components/ProductImportModal.tsx')
  ]);
  assert.match(css,/product-library-row-title strong/);
  assert.match(css,/color:var\(--ds-text\)!important/);
  assert.ok(index.indexOf('./styles/product-library-contrast-v257.css')>index.indexOf('./styles/interface-polish-v256.css'));
  assert.ok(index.indexOf('./styles/document-premium-redesign-v141.css')>index.indexOf('./styles/product-library-contrast-v257.css'));
  assert.match(importer,/Smart catalog import/);
  assert.match(importer,/Sale price/);
  assert.match(importer,/lastUnitCost/);
});
