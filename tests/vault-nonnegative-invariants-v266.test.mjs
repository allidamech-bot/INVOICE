import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createManualInventoryMovement } from '../dist/src/lib/operations.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';

function saved(){
  return {id:'item-1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',sku:'ITEM-1',descriptionEn:'Tracked item',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'20',lastCurrency:'USD',lastUnitCost:'10',lastCostCurrency:'USD',usageCount:0,lastUsedAt:'2026-01-01T00:00:00.000Z',category:'',tags:[],favorite:false};
}

test('vault rejects a tiny negative saved-item sale price instead of rounding it to zero',()=>{
  const base=emptyVault();base.savedItems=[saved()];
  const intended=structuredClone(base),latest=structuredClone(base);
  intended.savedItems[0].lastUnitPrice='-0.00001';
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/non-negative price/i);
});

test('vault rejects a tiny negative saved-item unit cost from any mutation path',()=>{
  const base=emptyVault();base.savedItems=[saved()];
  const intended=structuredClone(base),latest=structuredClone(base);
  intended.savedItems[0].lastUnitCost='-0.00001';
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/non-negative unit cost/i);
});

test('vault rejects a tiny negative manual inventory unit cost',()=>{
  const base=emptyVault();const item=saved();base.savedItems=[item];
  const intended=structuredClone(base),latest=structuredClone(base);
  const movement=createManualInventoryMovement(item,'opening','1','2026-09-01','Opening','1','USD');
  movement.unitCost='-0.00001';
  intended.inventoryMovements.push(movement);
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/unit cost must be zero or greater/i);
});

test('vault rejects a tiny negative customer credit limit',()=>{
  const base=emptyVault();
  const customer={id:'customer-1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',companyNameEn:'Customer',companyNameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'USD',paymentTerms:'',notes:'',creditLimit:'0',creditCurrency:'USD',paymentDueDays:'',paymentTermPresetId:''};
  base.customers=[customer];
  const intended=structuredClone(base),latest=structuredClone(base);
  intended.customers[0].creditLimit='-0.00001';
  assert.throws(()=>mergeVaultIntent(base,intended,latest),/credit limit must be zero or greater/i);
});
