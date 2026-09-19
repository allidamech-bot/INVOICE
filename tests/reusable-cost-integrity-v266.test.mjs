import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { defaultCompany } from '../dist/src/lib/defaults.js';
import { documentItemFromSavedItem, historySuggestions, savedItemFromDocumentItem } from '../dist/src/lib/saved-items.js';
import { validInternalCost } from '../dist/src/lib/profitability.js';

function documentItem(unitCost=''){return{id:'line-1',descriptionEn:'Reusable item',descriptionAr:'صنف قابل لإعادة الاستخدام',hsCode:'2202',origin:'TR',packing:'12 pcs',quantity:'1',unit:'PCS',unitPrice:'2.00',unitCost};}
function savedItem(lastUnitCost='1.00001'){return{id:'saved-1',createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-01T00:00:00.000Z',sku:'REUSE-1',descriptionEn:'Reusable item',descriptionAr:'صنف قابل لإعادة الاستخدام',hsCode:'2202',origin:'TR',packing:'12 pcs',unit:'PCS',lastUnitPrice:'2.00',lastCurrency:'USD',lastUnitCost,lastCostCurrency:'USD',usageCount:2,lastUsedAt:'2026-09-01T00:00:00.000Z',category:'',tags:[],favorite:false};}

test('v266 saving a document item rejects a negative micro-cost',()=>{
  assert.throws(()=>savedItemFromDocumentItem(documentItem('-0.00001'),'USD'),/Unit cost must be zero or greater/);
});

test('v266 saving a document item preserves a valid high-precision reusable cost',()=>{
  const saved=savedItemFromDocumentItem(documentItem('1.00001'),'USD');
  assert.equal(saved.lastUnitCost,'1.00001');
  assert.equal(saved.lastCostCurrency,'USD');
});

test('v266 saving an existing item with no document cost does not erase its reusable cost',()=>{
  const existing=savedItem('1.00001');
  const updated=savedItemFromDocumentItem(documentItem(''),'EUR',existing);
  assert.equal(updated.lastUnitCost,'1.00001');
  assert.equal(updated.lastCostCurrency,'USD');
  assert.equal(updated.lastCurrency,'EUR');
});

test('v266 invalid legacy reusable costs are not injected into new document lines',()=>{
  const restored=documentItemFromSavedItem(savedItem('-0.00001'));
  assert.equal(restored.unitCost,'');
});

test('v266 invalid historical costs are omitted from history suggestions without breaking history',()=>{
  const doc=createBlankDocument('invoice','INV-2026-9001',defaultCompany());
  doc.items=[documentItem('-0.00001')];
  const suggestions=historySuggestions([doc]);
  assert.equal(suggestions.length,1);
  assert.equal(suggestions[0].lastUnitCost,'');
  assert.equal(suggestions[0].lastCostCurrency,'');
});

test('v266 profitability cost validator rejects negative micro-costs and accepts precise positive costs',()=>{
  assert.equal(validInternalCost('-0.00001'),false);
  assert.equal(validInternalCost('1.00001'),true);
  assert.equal(validInternalCost(''),true);
});
