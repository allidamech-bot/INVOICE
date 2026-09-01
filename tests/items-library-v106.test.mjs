import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v106 gives large saved-item libraries deterministic category discovery',async()=>{
  const modal=await read('src/components/SavedItemsModal.tsx');
  assert.match(modal,/type SortMode='smart'\|'name'\|'recent'\|'category'/);
  assert.match(modal,/filterCategory:string/);
  assert.match(modal,/By category/);
  assert.match(modal,/saved-items-quick-filters/);
  assert.match(modal,/All categories/);
  assert.match(modal,/basePool\.filter\(item=>categoryOf\(item\)===category\)/);
});

test('v106 accelerates saved-item search and bulk picker selection',async()=>{
  const modal=await read('src/components/SavedItemsModal.tsx');
  assert.match(modal,/event\.key==='\/'/);
  assert.match(modal,/event\.key==='Escape'/);
  assert.match(modal,/saved-items-search-clear/);
  assert.match(modal,/toggleVisibleSelection/);
  assert.match(modal,/Select visible/);
  assert.match(modal,/Deselect visible/);
  assert.match(modal,/currently visible/);
});

test('v106 styling stays app-only, offline-capable, and below the final performance layer',async()=>{
  const [css,index,sw]=await Promise.all([
    read('src/styles/items-library-v106.css'),
    read('index.html'),
    read('public/sw.js')
  ]);
  assert.match(css,/v106 — large-catalog saved-items refinement/);
  assert.match(css,/\.app-ui \.saved-items-quick-filters/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/@media print/);
  assert.match(index,/items-library-v106\.css/);
  assert.ok(index.indexOf('items-library-v106.css')<index.indexOf('performance-polish-v100.css'));
  assert.match(sw,/\.\/styles\/items-library-v106\.css/);
});
