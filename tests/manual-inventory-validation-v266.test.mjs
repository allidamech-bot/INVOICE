import test from 'node:test';
import assert from 'node:assert/strict';
import { createManualInventoryMovement, inventoryMovementAccountingIsValid } from '../dist/src/lib/operations.js';

function savedItem(){return{id:'manual-stock-item',createdAt:'2026-09-19T00:00:00.000Z',updatedAt:'2026-09-19T00:00:00.000Z',sku:'MANUAL',descriptionEn:'Manual stock item',descriptionAr:'صنف مخزون يدوي',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'',lastCurrency:'USD',lastUnitCost:'1.00001',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'',category:'',tags:[],favorite:false};}

test('v266 manual inventory movement rejects malformed unit cost before a success can be recorded',()=>{
  const item=savedItem();
  assert.throws(()=>createManualInventoryMovement(item,'opening','5','2026-09-19','Opening','abc','USD'),/unit cost must be zero or greater/);
});

test('v266 manual inventory movement rejects negative micro-cost instead of rounding it to zero',()=>{
  const item=savedItem();
  assert.throws(()=>createManualInventoryMovement(item,'issue','1','2026-09-19','Issue','-0.00001','USD'),/unit cost must be zero or greater/);
});

test('v266 manual inventory movement preserves valid high-precision cost and remains accounting-valid',()=>{
  const item=savedItem();
  const movement=createManualInventoryMovement(item,'opening','5','2026-09-19','Opening','1.00001','USD');
  assert.equal(movement.unitCost,'1.00001');
  assert.equal(movement.quantity,'5');
  assert.equal(inventoryMovementAccountingIsValid(movement),true);
});
