import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v246 localizes known Saved Items categories without changing canonical filter values',async()=>{
  const source=await read('src/components/SavedItemsModal.tsx');
  assert.match(source,/const categoryLabel=\(value:string\)=>categoryPresetMap\.get\(value\)\|\|value;/);
  assert.match(source,/categoryOf\(item\)===this\.state\.category/,'category browsing must still compare canonical values');
  assert.match(source,/categoryOf\(item\)===this\.state\.filterCategory/,'quick filtering must still compare canonical values');
  assert.match(source,/<span>\{categoryLabel\(category\)\}<\/span><small>\{count\}<\/small>/,'quick filter label must be localized');
  assert.match(source,/<span>\{categoryLabel\(category\)\}<\/span><small>\{this\.props\.items\.filter/,'category browser label must be localized');
  assert.match(source,/categoryLabel\(this\.state\.filterCategory\)/,'active quick-filter context must be localized');
  assert.match(source,/categoryLabel\(categoryOf\(item\)\)/,'saved-item row category chip must be localized');
});
