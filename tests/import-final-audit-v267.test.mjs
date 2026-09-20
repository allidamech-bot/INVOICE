import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeImportedDecimal, parseCsvMatrix } from '../dist/src/lib/product-import.js';
import { extractSupplierDraftLocally } from '../dist/src/lib/supplier-document-import.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v267 deterministic CSV parsing handles semicolon, tab and localized decimals',()=>{
  assert.deepEqual(parseCsvMatrix('SKU;Name;Price\nA-1;Coffee;12,50'),[
    ['SKU','Name','Price'],['A-1','Coffee','12,50']
  ]);
  assert.deepEqual(parseCsvMatrix('SKU\tName\tCost\nA-2\tTea\t4.20'),[
    ['SKU','Name','Cost'],['A-2','Tea','4.20']
  ]);
  assert.equal(normalizeImportedDecimal('١٬٢٣٤٫٥٠'),'1234.50');
  assert.equal(normalizeImportedDecimal('1.234,50 EUR'),'1234.50');
});

test('v267 structured supplier spreadsheet becomes a local review-only draft without AI',()=>{
  const matrix=[
    ['Supplier','ACME Foods'],
    ['Invoice No','PI-77'],
    ['Currency','EUR'],
    [],
    ['SKU','Product Name','Quantity','Unit','Purchase Price'],
    ['B-10','Biscuit 50g','24','Carton','1,25'],
    ['C-20','Chocolate','10','Box','2.40']
  ];
  const draft=extractSupplierDraftLocally(matrix);
  assert.ok(draft);
  assert.equal(draft.supplierName,'ACME Foods');
  assert.equal(draft.documentNumber,'PI-77');
  assert.equal(draft.currency,'EUR');
  assert.equal(draft.items.length,2);
  assert.deepEqual(draft.items[0],{sku:'B-10',descriptionEn:'Biscuit 50g',descriptionAr:'',quantity:'24',unit:'Carton',unitCost:'1.25'});
});

test('v267 local supplier parsing never silently truncates a large sheet',()=>{
  const matrix=[['SKU','Product Name','Quantity','Unit','Purchase Price']];
  for(let index=1;index<=145;index+=1)matrix.push([`SKU-${index}`,`Item ${index}`,String(index),'PCS','1.25']);
  const draft=extractSupplierDraftLocally(matrix);
  assert.ok(draft);
  assert.equal(draft.items.length,145);
});

test('v267 import UIs keep local-first mapping, bounded previews and explicit confirmation',async()=>{
  const [product,supplier,reader,css,ui]=await Promise.all([
    read('src/components/ProductImportModal.tsx'),
    read('src/components/SupplierDocumentImport.tsx'),
    read('src/lib/spreadsheet-reader.ts'),
    read('src/styles/product-library-contrast-v257.css'),
    read('src/components/UI.tsx')
  ]);
  assert.match(reader,/XLSX_RUNTIME='\.\/vendor\/xlsx\.full\.min\.js'/);
  assert.doesNotMatch(product,/cdn\.jsdelivr\.net\/npm\/xlsx/);
  assert.match(product,/sheets\.length>1/);
  assert.match(product,/plan\?\.rows\.slice\(0,20\)/);
  assert.match(product,/Confirm import of/);
  assert.match(product,/larger than 12 MB/);
  assert.match(product,/Stock belongs to Inventory/);
  assert.match(product,/stock and accounting are never changed/);
  assert.match(supplier,/extractSupplierDraftFromSheets/);
  assert.match(supplier,/stage:'extracting'/);
  assert.match(supplier,/stage:'ai'/);
  assert.match(supplier,/Confirm & Save Draft/);
  assert.match(supplier,/status:'draft'/);
  assert.doesNotMatch(supplier,/window\.location\.reload/);
  assert.match(css,/modal:has\(\.supplier-import-shell\)/);
  assert.match(ui,/window\.visualViewport/);
  assert.match(ui,/--modal-visual-height/);
  assert.match(ui,/--modal-browser-bottom-reserve/);
  assert.match(ui,/display-mode: standalone/);
  assert.match(css,/height:calc\(var\(--modal-visual-height,100dvh\) - var\(--modal-browser-bottom-reserve,0px\)/);
  assert.match(css,/height:calc\(var\(--modal-visual-height,100dvh\)/);
  assert.match(css,/var\(--app-safe-bottom,0px\)/);
});
