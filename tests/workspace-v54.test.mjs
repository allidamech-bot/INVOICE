import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('documents expose direct quote and invoice creation with functional search and currency-safe sorting',async()=>{
 const page=await read('src/components/DocumentsPage.tsx');
 assert.match(page,/onClick=\{\(\)=>this\.props\.onNew\('proforma'\)\}/);
 assert.match(page,/onClick=\{\(\)=>this\.props\.onNew\('invoice'\)\}/);
 assert.ok(page.includes("t('Quotation','عرض سعر')"));
 assert.ok(page.includes("t('Invoice','فاتورة')"));
 for(const token of ['ta-doc-search-input','ta-doc-filter-button','ta-doc-register-meta','ta-doc-search-clear'])assert.ok(page.includes(token),token);
 assert.ok(page.includes('Search number, customer, item, HS code'));
 assert.ok(page.includes('Highest total (by currency)'));
 assert.ok(page.includes('Lowest total (by currency)'));
 assert.match(page,/documentSearchText/);
 assert.match(page,/itemCountLabel/);
});

test('current service worker ships the template and workspace changes to installed devices',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/src\/components\/DocumentsPage\.js/);
  assert.match(sw,/src\/templates\/TemplateThumbnails\.js/);
  assert.match(sw,/styles\/template-preferences\.css/);
});
