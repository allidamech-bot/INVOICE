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

test('v257 treats the real Russian Mars Unit EURO EXW column as an EUR sale price and updates prior imports',()=>{
  const existing={
    id:'mars-50',createdAt:'2026-09-17T00:00:00.000Z',updatedAt:'2026-09-17T00:00:00.000Z',
    sku:'',descriptionEn:'Mars 50g',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',
    lastUnitPrice:'',lastCurrency:'USD',usageCount:0,lastUsedAt:'2026-09-17T00:00:00.000Z'
  };
  const matrix=[
    ['','',''],
    ['Product','Name','Unit EURO EXW'],
    ['','Mars 50g','EUR 0.422'],
    ['','Mars 81g','EUR 0.593']
  ];
  const plan=planProductImport(matrix,[existing],'USD',true);
  assert.deepEqual(plan.counts,{create:1,update:1,skip:0,error:0});
  assert.ok(plan.recognizedFields.includes('lastUnitPrice'));
  assert.ok(!plan.recognizedFields.includes('unit'));
  const updated=importableProducts(plan).find(item=>item.id==='mars-50');
  assert.ok(updated);
  assert.equal(updated.lastUnitPrice,'0.422');
  assert.equal(updated.lastCurrency,'EUR');
  assert.equal(updated.unit,'PCS');
  const created=importableProducts(plan).find(item=>item.descriptionEn==='Mars 81g');
  assert.ok(created);
  assert.equal(created.lastUnitPrice,'0.593');
  assert.equal(created.lastCurrency,'EUR');
  assert.equal(created.unit,'PCS');
});

test('current product UI keeps imported names readable and preserves price, cost and classification fields',async()=>{
 const [html,css,importer]=await Promise.all([read('index.html'),read('src/styles/tailadmin-products-v320.css'),read('src/components/ProductImportModal.tsx')]);
 assert.ok(html.includes('tailadmin-products-v320.css'));
 for(const token of ['.ta-product','var(--ft-text','min-height:44px'])assert.ok(css.includes(token),token);
 for(const token of ['Smart catalog import','Sale price','lastUnitCost'])assert.ok(importer.includes(token),token);
 assert.ok(!css.includes('.invoice-page'),'product import styling cannot alter printed paper');
});

