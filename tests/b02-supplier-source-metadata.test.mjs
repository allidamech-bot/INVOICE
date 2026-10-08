import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSupplierDraftLocally,combineSupplierImportDrafts} from '../dist/src/lib/supplier-document-import.js';

const table=(qty='10',unitCost='USD 1.25',currency='USD')=>[
  ['SKU','Product Name','Quantity','Purchase Price','Currency'],
  ['B1','Biscuits',qty,unitCost,currency]
];

test('B02: supplier source rejects zero quantity before the review stage',()=>{
  assert.throws(()=>extractSupplierDraftLocally(table('0')),/row 2 is incomplete/);
  assert.throws(()=>extractSupplierDraftLocally(table('0.000')),/row 2 is incomplete/);
  assert.ok(extractSupplierDraftLocally(table('0.005')));
});

test('B02: rejects contradictory cost-cell currency and row currency even if a document currency is otherwise found',()=>{
  assert.throws(()=>extractSupplierDraftLocally(table('10','EUR 1.25','USD')),/conflicting currency in the column and unit cost/);
  assert.throws(()=>extractSupplierDraftLocally([
    ['Currency','EUR'],...table('10','USD 1.25','EUR')
  ]),/conflicting currency in the column and unit cost/);
});

test('B02: retains all independently extracted notes and original source labels in a multi-file review',()=>{
  const a=extractSupplierDraftLocally(table()),b=extractSupplierDraftLocally(table());
  assert.ok(a&&b);
  const merged=combineSupplierImportDrafts([
    {name:'supplier-offer.pdf',draft:{...a,notes:'MOQ: 10 cartons\nLead time: 20 days'}},
    {name:'supplier-annex.xlsx',draft:{...b,notes:'Origin: Türkiye\nProduct 50g'}}
  ]);
  assert.match(merged.notes,/supplier-offer\.pdf/);
  assert.match(merged.notes,/MOQ: 10 cartons/);
  assert.match(merged.notes,/supplier-annex\.xlsx/);
  assert.match(merged.notes,/Origin: Türkiye/);
  assert.equal(merged.items.length,2);
});

test('B02: single-source notes are preserved without unnecessary rewriting',()=>{
  const a=extractSupplierDraftLocally(table());assert.ok(a);
  assert.equal(combineSupplierImportDrafts([{name:'single.pdf',draft:{...a,notes:'Keep refrigerated'}}]).notes,'Keep refrigerated');
});
