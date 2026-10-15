import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewProductAiRows} from '../dist/src/lib/product-ai-review.js';

const make=(sku,descriptionEn='',descriptionAr='',unit='PCS')=>({
 sku,descriptionEn,descriptionAr,brand:'',hsCode:'',origin:'',packing:'',
 cartonQuantity:'',unit,salePrice:'',saleCurrency:'',unitCost:'',
 costCurrency:'',category:'',notes:''
});

test('AI source repeats of a normalized SKU are blocked from preselection',()=>{
 const rows=[make('sku-13','Motor one'),make('SKU-13','Motor duplicate'),make('SAFE-99','Unique pump')];
 const reviews=reviewProductAiRows([],rows,'USD');
 assert.deepEqual(reviews.map(r=>r.classification),['duplicate-candidate','duplicate-candidate','new-product']);
 assert.deepEqual(reviews.map(r=>r.defaultSelected),[false,false,true]);
 assert.equal(reviews[0].reason,'repeated-product-in-source');
});

test('AI source duplicate normalized product names block even with different SKUs',()=>{
 const rows=[make('A1','Industrial Valve'),make('B2','industrial valve'),make('C3','Unique pressure gauge')];
 const reviews=reviewProductAiRows([],rows,'USD');
 assert.equal(reviews[0].classification,'duplicate-candidate');
 assert.equal(reviews[1].classification,'duplicate-candidate');
 assert.equal(reviews[2].defaultSelected,true);
});

test('AI source repeated matches to a single existing product cannot both be selected',()=>{
 const existing=[{id:'existing',sku:'MATCH-1',descriptionEn:'Existing Motor',descriptionAr:'',archived:false}];
 const rows=[make('MATCH-1','Motor update 1'),make('match-1','Motor update 2')];
 const reviews=reviewProductAiRows(existing,rows,'USD');
 assert.deepEqual(reviews.map(r=>r.defaultSelected),[false,false]);
 assert.ok(reviews.every(r=>r.classification==='duplicate-candidate'));
});

test('source rows without any product identity remain blocked for required identity',()=>{
 const reviews=reviewProductAiRows([],[make('','','','PCS'),make('','','','PCS')],'USD');
 assert.ok(reviews.every(r=>r.classification==='needs-review'&&!r.defaultSelected));
});
