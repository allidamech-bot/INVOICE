import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v259 product library exposes direct single-item actions and bulk selection',async()=>{
  const workspace=await read('src/components/ProductLibraryWorkspace.tsx');
  assert.match(workspace,/icon="more" label=\{t\('Product actions','إجراءات الأصناف'\)\}/);
  assert.match(workspace,/Select products/);
  assert.match(workspace,/product-library-selection-bar/);
  assert.match(workspace,/Select visible/);
  assert.match(workspace,/Delete selected/);
  assert.match(workspace,/product-library-row-menu/);
  assert.match(workspace,/requestSingleDelete\(item\)/);
  assert.match(workspace,/requestBulkDelete/);
  assert.match(workspace,/removeSelected=async/);
  assert.match(workspace,/for\(const item of products\)\{await this\.props\.onDelete\(item\);deleted\+=1;\}/);
  assert.match(workspace,/Existing invoices and quotes stay unchanged/);
});

test('v259 selection mode is explicit, reversible and keeps destructive actions confirmed',async()=>{
  const workspace=await read('src/components/ProductLibraryWorkspace.tsx');
  assert.match(workspace,/selectionMode:boolean/);
  assert.match(workspace,/selectedIds:string\[\]/);
  assert.match(workspace,/bulkDeleteConfirm:boolean/);
  assert.match(workspace,/beginSelection/);
  assert.match(workspace,/endSelection/);
  assert.match(workspace,/toggleSelection/);
  assert.match(workspace,/Delete selected products\?/);
  assert.match(workspace,/Save or discard the current product changes before deleting a product/);
});

test('v259 keeps product import footer inside small Safari viewports',async()=>{
  const css=await read('src/styles/product-library-contrast-v257.css');
  assert.match(css,/\.modal:has\(\.product-import-shell\)/);
  assert.match(css,/100svh/);
  assert.match(css,/\.modal:has\(\.product-import-shell\)>\.modal-body/);
  assert.match(css,/\.modal:has\(\.product-import-shell\)>\.modal-footer/);
  assert.match(css,/\.product-import-mapping-list\{\s*max-height:none;\s*overflow:visible;/);
  assert.match(css,/product-library-selection-actions/);
  assert.match(css,/product-library-menu/);
});
