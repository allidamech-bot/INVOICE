import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v102 saved items support organization metadata without changing existing required item fields',async()=>{
  const [types,lib]=await Promise.all([read('src/types.ts'),read('src/lib/saved-items.ts')]);
  assert.match(types,/category\?: string;/);
  assert.match(types,/tags\?: string\[\];/);
  assert.match(types,/favorite\?: boolean;/);
  assert.match(lib,/category:existing\?\.category\?\?''/);
  assert.match(lib,/tags:\[\.\.\.\(existing\?\.tags\?\?\[\]\)\]/);
  assert.match(lib,/favorite:Boolean\(existing\?\.favorite\)/);
  assert.match(lib,/item\.category\?\?''/);
  assert.match(lib,/\.\.\.\(item\.tags\?\?\[\]\)/);
});

test('v102 library exposes favorites recent categories all search and sorting',async()=>{
  const modal=await read('src/components/SavedItemsModal.tsx');
  for(const marker of ["'favorites'|'recent'|'categories'|'all'","saved-items-smart-nav","saved-items-categories","saved-items-sort","saved-item-favorite","Search name, code, category or tag","Most used","Latest used","A–Z"]){
    assert.match(modal,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  assert.match(modal,/this\.props\.items\.some\(item=>item\.favorite\)\?'favorites':'recent'/);
  assert.match(modal,/slice\(0,24\)/);
  assert.match(modal,/aria-pressed=\{Boolean\(item\.favorite\)\}/);
});

test('v102 editor can assign categories tags and favorites and large-library styling stays app-only',async()=>{
  const [modal,css]=await Promise.all([read('src/components/SavedItemsModal.tsx'),read('src/styles/saved-items-v95.css')]);
  assert.match(modal,/label=\{t\('Category','التصنيف'\)\}/);
  assert.match(modal,/label=\{t\('Tags','الوسوم'\)\}/);
  assert.match(modal,/Keep this item in Favorites/);
  for(const className of ['saved-items-smart-nav','saved-items-categories','saved-items-list-context','saved-item-favorite','saved-item-row-meta'])assert.match(css,new RegExp(`\\.${className}`));
  assert.match(css,/grid-template-columns:34px minmax\(0,1fr\) 42px/);
  assert.match(css,/@media \(max-width:720px\)[\s\S]*?saved-items-smart-nav[\s\S]*?overflow-x:auto/);
  assert.doesNotMatch(css,/\.invoice-page|\.document-page|\.a4[-_]/i);
});
