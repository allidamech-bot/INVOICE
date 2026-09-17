import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeProductImport, applyProductImportMapping, suggestedProductImportMap } from '../dist/src/lib/product-import-intelligence.js';
import { importableProducts, planProductImport } from '../dist/src/lib/product-import.js';

const read=path=>readFile(path,'utf8');

test('v258 local intelligence finds the real header row and separates price from unit',()=>{
  const matrix=[
    ['Supplier catalogue 2027','',''],
    ['Product','Name','Unit EURO EXW'],
    ['','Mars 50g','EUR 0.422'],
    ['','Mars 81g','EUR 0.593']
  ];
  const analysis=analyzeProductImport(matrix);
  assert.equal(analysis.headerIndex,1);
  const byHeader=new Map(analysis.columns.map(column=>[column.header,column]));
  assert.equal(byHeader.get('Unit EURO EXW')?.field,'lastUnitPrice');
  assert.equal(byHeader.get('Name')?.field,'descriptionEn');
  assert.equal(byHeader.get('Product')?.field,null);
  assert.ok(analysis.recognizedFields.includes('lastUnitPrice'));
  assert.ok(!analysis.recognizedFields.includes('unit'));
});

test('v258 understands common multilingual commercial headings without external AI',()=>{
  const matrix=[
    ['Liste fournisseur','','','',''],
    ['Artikelnummer','Bezeichnung','Preis EUR','Verpackung','Ursprung'],
    ['A-10','Chocolate Bar','1.25','24 x 50g','Türkiye']
  ];
  const analysis=analyzeProductImport(matrix);
  const mapping=suggestedProductImportMap(analysis);
  const mapped=applyProductImportMapping(matrix,analysis,mapping);
  const plan=planProductImport(mapped,[],'USD',true);
  assert.deepEqual(plan.counts,{create:1,update:0,skip:0,error:0});
  const item=importableProducts(plan)[0];
  assert.equal(item.sku,'A-10');
  assert.equal(item.descriptionEn,'Chocolate Bar');
  assert.equal(item.lastUnitPrice,'1.25');
  assert.equal(item.lastCurrency,'EUR');
  assert.equal(item.packing,'24 x 50g');
  assert.equal(item.origin,'Türkiye');
});

test('v258 manual mapping makes unknown supplier columns importable and never maps duplicates silently',()=>{
  const matrix=[
    ['ACME export list','','',''],
    ['Alpha','Beta','Gamma','Delta'],
    ['P-1','Premium Biscuit','2.75','USD']
  ];
  const analysis=analyzeProductImport(matrix);
  const mapping=Array.from({length:analysis.columnCount},()=>null);
  mapping[0]='sku';
  mapping[1]='descriptionEn';
  mapping[2]='lastUnitPrice';
  mapping[3]='lastCurrency';
  const mapped=applyProductImportMapping(matrix,analysis,mapping);
  const plan=planProductImport(mapped,[],'SAR',true);
  const item=importableProducts(plan)[0];
  assert.equal(item.sku,'P-1');
  assert.equal(item.descriptionEn,'Premium Biscuit');
  assert.equal(item.lastUnitPrice,'2.75');
  assert.equal(item.lastCurrency,'USD');

  const duplicate=[...mapping];
  duplicate[3]='lastUnitPrice';
  assert.throws(()=>applyProductImportMapping(matrix,analysis,duplicate),/only be mapped to one source column/i);
});

test('v258 mapping UI keeps matte-black contrast, mobile geometry and explicit review-before-write',async()=>{
  const [modal,css,intelligence]=await Promise.all([
    read('src/components/ProductImportModal.tsx'),
    read('src/styles/product-library-contrast-v257.css'),
    read('src/lib/product-import-intelligence.ts')
  ]);
  assert.match(modal,/LOUREX Intelligence/);
  assert.match(modal,/Review import/);
  assert.match(modal,/product-import-map-select/);
  assert.match(modal,/does not send catalog data to an external AI service/);
  assert.match(css,/product-import-mapping-row/);
  assert.match(css,/color:var\(--ds-text\)!important/);
  assert.match(css,/color-scheme:dark/);
  assert.match(css,/@media \(max-width:390px\)/);
  assert.match(intelligence,/applyProductImportMapping/);
  assert.match(intelligence,/Unit Price/);
});
