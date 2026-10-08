import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planProductImport,planProductImportBatch,importableProducts} from '../dist/src/lib/product-import.js';
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

test('B02: multi-file catalog import blocks all source writes when one worksheet has conflicting price currency',()=>{
  const plan=planProductImportBatch([
    {name:'a.xlsx / Products',matrix:[['SKU','Product Name','Unit Cost EUR'],['A-1','Biscuit','EUR 1.25']]},
    {name:'b.xlsx / Products',matrix:[['SKU','Product Name','Selling Price USD','Currency'],['B-2','Coffee','EUR 3.25','USD']]}
  ],[],'USD',true);
  assert.equal(plan.counts.error,1);
  assert.equal(plan.counts.create,1);
  assert.equal(plan.rows.find(row=>row.action==='error')?.sourceName,'b.xlsx / Products');
});

test('B02: trade-price acknowledgments are per selected worksheet and reset after remapping',async()=>{
  const source=await readFile('src/components/ProductImportModal.tsx','utf8');
  assert.match(source,/tradePriceAcknowledged:Record<number,boolean>/);
  assert.match(source,/private tradePriceColumnsFor=/);
  assert.match(source,/private unapprovedTradeSheets=/);
  assert.match(source,/this\.unapprovedTradeSheets\(\)/);
  assert.match(source,/tradePriceAcknowledged:\{\.\.\.this\.state\.tradePriceAcknowledged,\[this\.state\.sheetIndex\]:false\}/);
  assert.match(source,/disabled=\{mappedCount===0\|\|selectedSheets\.length===0\|\|this\.state\.aiLoading\|\|unapprovedTradeSheets\.length>0\}/);
  assert.match(source,/Confirm EXW \/ FOB \/ CIF buying or selling price/);
  assert.match(source,/planProductImportBatch/);
  assert.match(source,/Choose up to 4 Excel or CSV files/);
  assert.match(source,/selectedSheets\.map\(index=>/);
});
