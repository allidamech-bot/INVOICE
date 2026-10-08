import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importableProducts,planProductImportBatch} from '../dist/src/lib/product-import.js';
import {analyzeProductImport,applyProductImportMapping,suggestedProductImportMap} from '../dist/src/lib/product-import-intelligence.js';

const sheet=(name,header,lines)=>({name,matrix:[header,...lines]});
const fields=['SKU','Product Name','Selling Price USD','Purchase Price USD'];

test('B02 catalog multi-file planner includes all selected sheets and keeps sale vs cost separate',()=>{
  const sources=[
    sheet('file-a.xlsx / Products',fields,[['A-1','Biscuit','2.25','1.50']]),
    sheet('file-b.csv / Products',fields,[['B-1','Coffee','8.50','5.00']])
  ];
  const plan=planProductImportBatch(sources,[],'SAR',true);
  assert.deepEqual(plan.counts,{create:2,update:0,skip:0,error:0});
  assert.deepEqual(plan.rows.map(row=>row.sourceName),sources.map(row=>row.name));
  const items=importableProducts(plan);
  assert.deepEqual(items.map(item=>[item.sku,item.lastUnitPrice,item.lastUnitCost,item.lastCurrency,item.lastCostCurrency]),[
    ['A-1','2.25','1.50','USD','USD'],
    ['B-1','8.50','5.00','USD','USD']
  ]);
});

test('B02 catalog detects duplicate products across source files before any save',()=>{
  const sources=[
    sheet('a.xlsx / first',fields,[['A-1','Biscuit','2.25','1.50']]),
    sheet('b.xlsx / duplicate',fields,[['A-1','Biscuit','2.50','1.70']])
  ];
  const plan=planProductImportBatch(sources,[],'SAR',true);
  assert.equal(plan.counts.create,1);
  assert.equal(plan.counts.error,1);
  assert.match(plan.rows[1].reason,/Duplicate product across worksheets/);
});

test('B02 catalog blocks importing a selected but empty product worksheet',()=>{
  assert.throws(()=>planProductImportBatch([
    sheet('valid',fields,[['B-1','Coffee','8.50','5.00']]),
    sheet('empty',fields,[])
  ],[],'SAR',true),/has no product rows/);
});

test('B02 EXW supplier price stays purchase cost under local smart mapping, not selling price',()=>{
  const matrix=[['Item Code','Product Name','Unit EURO EXW'],['A-1','Chocolate','EUR 0.422']];
  const analysis=analyzeProductImport(matrix);
  const mapped=applyProductImportMapping(matrix,analysis,suggestedProductImportMap(analysis));
  const plan=planProductImportBatch([{name:'supplier.xlsx',matrix:mapped}],[],'USD',true);
  assert.equal(plan.counts.error,0);
  assert.equal(importableProducts(plan)[0].lastUnitCost,'0.422');
  assert.equal(importableProducts(plan)[0].lastUnitPrice,'');
  assert.equal(importableProducts(plan)[0].lastCostCurrency,'EUR');
});

test('B02 catalog UI preserves independent per-sheet mappings and one atomic approval',async()=>{
  const ui=await readFile('src/components/ProductImportModal.tsx','utf8');
  assert.match(ui,/MAX_IMPORT_FILES=4/);
  assert.match(ui,/MAX_BATCH_BYTES=24\*1024\*1024/);
  assert.match(ui,/multiple onChange=\{\(event:any\)=>void this\.chooseFiles/);
  assert.match(ui,/sheetMappings:\{\.\.\.this\.state\.sheetMappings,\[this\.state\.sheetIndex\]:mapping\}/);
  assert.match(ui,/selectedSheets\.map\(index=>\{/);
  assert.match(ui,/planProductImportBatch\(sources,this\.props\.items,this\.props\.currency,updateExisting\)/);
  assert.match(ui,/importableProducts\(plan\)/);
  assert.match(ui,/await this\.props\.onSaveMany\(products\)/);
  assert.match(ui,/checked=\{selectedSheets\.includes\(index\)\}/);
  assert.match(ui,/row\.sourceName/);
});
