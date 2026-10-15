import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(p,'utf8');

test('one catalog import chooser exposes both distinct preserved routes',async()=>{
 const src=await read('src/components/ProductLibraryWorkspace.tsx');
 assert.match(src,/<details className="ta-product-import-entry"><summary aria-label=/);
 assert.match(src,/role="group" aria-label=\{t\('Product import methods'/);
 assert.match(src,/<AiWorkflowTools compact defaultRoute="product_list" disabled=\{this\.state\.selectionMode\}/);
 assert.match(src,/t\('Advanced spreadsheet import','استيراد الجداول المتقدم'\)/);
 assert.match(src,/onClick=\{this\.requestImport\}/);
 assert.match(src,/<ProductImportModal/);
 assert.match(src,/onClick=\{this\.requestImport\}/);
 assert.doesNotMatch(src,/t\('Import catalog','استيراد كتالوج'\)/,'duplicate overflow import removed, not underlying route');
});

test('spreadsheet multi-file, sheet-mapping and AI unknown-column capabilities were not removed',async()=>{
 const old=await read('src/components/ProductImportModal.tsx');
 const newer=await read('src/components/ProductAiSourceReview.tsx');
 for(const required of ['selectedSheets','sheetMappings','requestProductImportAiMapping','ambiguousProductImportColumns','tradePriceAcknowledged','planProductImportBatch','readSpreadsheetFile','onSaveMany(products)'])assert.ok(old.includes(required),required);
 for(const required of ['readablePdfText','readSpreadsheetFile','spreadsheetSheetsAsText','requestAiJson','reviewProductAiRows','mutateVaultSafely'])assert.ok(newer.includes(required),required);
});

test('catalog import chooser remains a local focusable 44px target',async()=>{
 const css=await read('src/styles/tailadmin-products-v320.css');
 const block=css.split('/* UX rehab B: one import entry')[1];
 assert.ok(block);
 assert.match(block,/\.ta-product-import-entry>summary\{[\s\S]*?min-height:44px/);
 assert.match(block,/\.ta-product-import-entry>summary:focus-visible/);
 assert.match(block,/\.ta-product-import-options \.btn\{[\s\S]*?min-height:44px!important/);
 assert.match(block,/@media screen and \(max-width:720px\)/);
});
