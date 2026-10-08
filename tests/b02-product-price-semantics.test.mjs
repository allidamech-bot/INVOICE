import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planProductImport,importableProducts} from '../dist/src/lib/product-import.js';
import {analyzeProductImport,suggestedProductImportMap,applyProductImportMapping} from '../dist/src/lib/product-import-intelligence.js';

test('B02: catalog import rejects a value with an in-cell currency different from column header',()=>{
  const plan=planProductImport([
    ['SKU','Product Name','Unit Cost USD','Cost Currency'],
    ['A1','Coffee','EUR 1.25','EUR']
  ],[],'USD');
  assert.equal(plan.counts.error,1);
  assert.match(plan.rows[0].reason,/conflicting currencies/);
  assert.deepEqual(importableProducts(plan),[]);
});

test('B02: explicit sale currency column cannot conflict with the sale price heading',()=>{
  const plan=planProductImport([
    ['SKU','Product Name','Selling Price USD','Currency'],
    ['A2','Choc','USD 2.00','EUR']
  ],[],'USD');
  assert.equal(plan.counts.error,1);
  assert.match(plan.rows[0].reason,/conflicting currencies/);
});

test('B02: supplier currency can be taken from a unit-cost cell when the header is currency-neutral',()=>{
  const plan=planProductImport([
    ['SKU','Product Name','Unit Cost'],
    ['A3','Biscuits','EUR 0.422']
  ],[],'USD');
  assert.equal(plan.counts.create,1);
  assert.equal(plan.counts.error,0);
  const item=importableProducts(plan)[0];
  assert.equal(item.lastUnitCost,'0.422');
  assert.equal(item.lastCostCurrency,'EUR');
  assert.equal(item.lastUnitPrice,'');
});

test('B02: catalog import permits separate cost and sale currencies when each is consistent',()=>{
  const plan=planProductImport([
    ['SKU','Product Name','Selling Price USD','Currency','Unit Cost EUR','Cost Currency'],
    ['A4','Chocolate','3.25','USD','2.50','EUR']
  ],[],'USD');
  assert.equal(plan.counts.create,1);
  const item=importableProducts(plan)[0];
  assert.equal(item.lastCurrency,'USD');
  assert.equal(item.lastCostCurrency,'EUR');
});

test('B02: trade Incoterms are treated as reviewable purchase costs in the normal mapped UI path',()=>{
  const source=[
    ['Product','Name','Unit EURO EXW'],
    ['','Mars 50g','EUR 0.422']
  ];
  const analysis=analyzeProductImport(source);
  const cost=analysis.columns.find(c=>c.header==='Unit EURO EXW');
  assert.equal(cost.field,'lastUnitCost');
  const mapped=applyProductImportMapping(source,analysis,suggestedProductImportMap(analysis));
  const plan=planProductImport(mapped,[],'USD');
  const product=importableProducts(plan)[0];
  assert.equal(product.lastUnitCost,'0.422');
  assert.equal(product.lastUnitPrice,'');
});

test('B02: the product UI requires explicit approval for EXW/FOB/CIF mapping and warns about sheet scope',async()=>{
  const source=await readFile('src/components/ProductImportModal.tsx','utf8');
  assert.match(source,/tradePriceAcknowledged:boolean/);
  assert.match(source,/private tradePriceColumns=/);
  assert.match(source,/this\.tradePriceColumns\(analysis,mapping\)\.length&&!this\.state\.tradePriceAcknowledged/);
  assert.match(source,/disabled=\{mappedCount===0\|\|this\.state\.aiLoading\|\|tradeRequiresReview\}/);
  assert.match(source,/Check EXW \/ FOB \/ CIF price meaning before import/);
  assert.match(source,/Only the selected worksheet is imported in this workflow/);
  assert.match(source,/tradePriceAcknowledged:false/);
});
