import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('product library retains row actions and transactional bulk selection with confirmed deletion',async()=>{
 const source=await read('src/components/ProductLibraryWorkspace.tsx');
 for(const token of ['Product actions','Select products','ta-product-selection','Select visible','Delete selected','ta-product-row-menu','requestSingleDelete(item)','requestBulkDelete','removeSelected=async','for(const item of products){await this.props.onDelete(item);deleted+=1;}','Existing invoices and quotes stay unchanged'])assert.ok(source.includes(token),token);
 assert.ok(source.includes('bulkDeleteConfirm'),'bulk delete must be confirmed before mutation');
 assert.ok(source.includes('mutationInFlight=true'),'bulk delete must guard concurrent changes');
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
