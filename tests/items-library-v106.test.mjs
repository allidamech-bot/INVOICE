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

test('saved-item filters are visible, touch accessible, and offline in the active product owner',async()=>{
 const [legacy,current,index,sw]=await Promise.all([
  read('src/styles/items-library-v106.css'),
  read('src/styles/tailadmin-products-v320.css'),
  read('index.html'),
  read('public/sw.js')
 ]);
 assert.match(legacy,/v106 — large-catalog saved-items refinement/);
 assert.equal(index.includes('items-library-v106.css'),false,'retired v106 style cannot override active product shell');
 assert.match(index,/tailadmin-products-v320\.css/);
 assert.match(current,/\.app-ui \.saved-items-quick-filters\{/);
 assert.match(current,/\.app-ui \.saved-items-quick-filters button\{[^}]*min-height:44px/);
 assert.match(current,/\.app-ui \.saved-items-quick-filters button\.active\{[^}]*var\(--ft-accent\)/);
 assert.match(current,/@media screen and \(max-width:720px\)/);
 assert.match(current,/@media screen and \(max-width:390px\)/);
 assert.doesNotMatch(current,/@media print|\.invoice-page/);
 assert.match(sw,/tailadmin-products-v320\.css/);
});
