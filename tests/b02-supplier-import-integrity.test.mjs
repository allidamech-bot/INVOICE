import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  extractSupplierDraftLocally,
  extractSupplierDraftFromSheets,
  combineSupplierImportDrafts
} from '../dist/src/lib/supplier-document-import.js';

const header=['SKU','Product Name','Quantity','Purchase Price','Currency'];
const row=(sku,name,quantity,cost,currency)=>[sku,name,quantity,cost,currency];
const table=(lines,metadata=[])=>[...metadata,header,...lines];

test('B02: refuses incomplete supplier lines instead of silently dropping them',()=>{
  const matrix=table([row('B1','Biscuit','10','1.25','USD'),row('B2','Chocolate','', '3.00','USD')]);
  assert.throws(()=>extractSupplierDraftLocally(matrix),/row 3 is incomplete/);
  assert.throws(()=>extractSupplierDraftLocally(table([row('B1','Biscuit','10','', 'USD')])),/incomplete/);
  assert.throws(()=>extractSupplierDraftLocally(table([row('','', '10','1.25','USD')])),/incomplete/);
});

test('B02: preserves complete rows and ignores only known headings/totals',()=>{
  const matrix=[header,row('B1','Biscuit','10','1,25','EUR'),header,row('','Subtotal','','12.50',''),row('B2','Tea','5','2.50','EUR')];
  const draft=extractSupplierDraftLocally(matrix);
  assert.ok(draft);
  assert.deepEqual(draft.items.map(i=>[i.sku,i.quantity,i.unitCost]),[['B1','10','1.25'],['B2','5','2.50']]);
  assert.equal(draft.currency,'EUR');
});

test('B02: detects conflicting line currencies, even if a metadata currency is present',()=>{
  assert.throws(()=>extractSupplierDraftLocally(table([
    row('A1','Choc','10','2.50','EUR'),
    row('A2','Coffee','12','3.10','USD')
  ])),/mixed currencies at row 3/);
  assert.throws(()=>extractSupplierDraftLocally(table([row('A1','Choc','10','2.50','USD')],[['Currency','EUR']])),/mixed currencies/);
  assert.throws(()=>extractSupplierDraftLocally(table([row('A1','Choc','10','2.50','UNKNOWN')])),/unrecognized currency/);
  assert.throws(()=>extractSupplierDraftLocally([
    ['Currency','EUR'],['SKU','Product Name','Quantity','Purchase Price USD'],['A1','Choc','10','1.00']
  ]),/conflicts with table header/);
});

test('B02: merges compatible supplier invoice worksheets without losing a row',()=>{
  const sheets=[
    {name:'Products',matrix:table([row('A1','Biscuit','24','1.25','EUR')],[['Supplier','ACME'],['Invoice No','P-77'],['Currency','EUR']])},
    {name:'Products 2',matrix:table([row('A2','Chocolate','48','1.40','EUR')],[['Supplier','ACME'],['Invoice No','P-77']])},
    {name:'Instructions',matrix:[['Read me: use product sheets above']]}
  ];
  const draft=extractSupplierDraftFromSheets(sheets);
  assert.ok(draft);
  assert.equal(draft.supplierName,'ACME');
  assert.equal(draft.documentNumber,'P-77');
  assert.equal(draft.currency,'EUR');
  assert.deepEqual(draft.items.map(i=>i.sku),['A1','A2']);
  assert.deepEqual(draft.sourceSheets?.map(s=>[s.name,s.itemCount]),[['Products',1],['Products 2',1]]);
  assert.deepEqual(draft.skippedSheets,['Instructions']);
});

test('B02: blocks conflicting worksheets instead of importing the first sheet only',()=>{
  const sheets=[
    {name:'USD',matrix:table([row('U1','Coffee','3','1.00','USD')],[['Supplier','ACME']])},
    {name:'EUR',matrix:table([row('E1','Tea','4','2.00','EUR')],[['Supplier','ACME']])}
  ];
  assert.throws(()=>extractSupplierDraftFromSheets(sheets),/conflicts on currency/);
  assert.throws(()=>extractSupplierDraftFromSheets([
    {name:'Good',matrix:table([row('U1','Coffee','3','1.00','USD')])},
    {name:'Header only',matrix:[header]}
  ]),/no complete lines/);
  assert.throws(()=>extractSupplierDraftFromSheets([
    {name:'Good',matrix:table([row('U1','Coffee','3','1.00','USD')],[['Invoice No','A']])},
    {name:'Other invoice',matrix:table([row('U2','Coffee','4','1.00','USD')],[['Invoice No','B']])}
  ]),/conflicts on documentNumber/);
});

test('B02: merging supplier PDF/Excel fragments never allows mixed purchase currencies',()=>{
  const usd=extractSupplierDraftLocally(table([row('U1','Coffee','10','1.00','USD')]));
  const eur=extractSupplierDraftLocally(table([row('E1','Tea','10','1.00','EUR')]));
  assert.ok(usd&&eur);
  assert.throws(()=>combineSupplierImportDrafts([{name:'first.pdf',draft:usd},{name:'second.xlsx',draft:eur}]),/conflicts on currency/);
  const same=combineSupplierImportDrafts([{name:'a.pdf',draft:usd},{name:'b.pdf',draft:usd}]);
  assert.equal(same.items.length,2);
  assert.equal(same.sourceSheets?.length,2);
});

test('B02: supplier UI accepts a bounded file batch and saves only after combined review',async()=>{
  const source=await readFile('src/components/SupplierDocumentImport.tsx','utf8');
  assert.match(source,/MAX_IMPORT_FILES=4/);
  assert.match(source,/MAX_BATCH_BYTES=24_000_000/);
  assert.match(source,/multiple onChange=\{\(event:any\)=>void this\.chooseFiles/);
  assert.match(source,/combineSupplierImportDrafts\(parsed\)/);
  assert.match(source,/parsed\.push\(\{name:file\.name,draft:extracted\}\)/);
  assert.match(source,/draft\.sourceSheets\?\.length/);
  assert.match(source,/draft\.skippedSheets\?\.length/);
  assert.ok(source.indexOf('combineSupplierImportDrafts(parsed)')<source.indexOf('private saveDraft=async()'));
  assert.match(source,/mutateVaultSafely\(vault=>\{/);
});
