import test from 'node:test';
import assert from 'node:assert/strict';
import { planProductImport } from '../dist/src/lib/product-import.js';

test('v266 product import rejects a negative micro-cost instead of rounding it to zero',()=>{
  const plan=planProductImport([
    ['SKU','Description EN','Unit Cost','Cost Currency'],
    ['MICRO-NEG','Micro negative cost','-0.00001','USD'],
  ],[],'USD',true);
  assert.equal(plan.rows.length,1);
  assert.equal(plan.rows[0].action,'error');
  assert.match(plan.rows[0].reason,/Unit cost is not a valid non-negative number/);
});

test('v266 product import preserves a valid high-precision landed cost',()=>{
  const plan=planProductImport([
    ['SKU','Description EN','Unit Cost','Cost Currency'],
    ['MICRO-POS','High precision cost','1.00001','USD'],
  ],[],'USD',true);
  assert.equal(plan.rows.length,1);
  assert.equal(plan.rows[0].action,'create');
  assert.equal(plan.rows[0].item?.lastUnitCost,'1.00001');
  assert.equal(plan.rows[0].item?.lastCostCurrency,'USD');
});
