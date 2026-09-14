import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v245 keeps product category storage canonical while localizing catalog labels',async()=>{
  const source=await read('src/components/ProductLibraryWorkspace.tsx');
  assert.match(source,/const categoryPresetMap=new Map\(categoryPresets\.map\(choice=>\[choice\.value,choice\.label\]\)\);/);
  assert.match(source,/const categoryLabel=\(value:string\)=>categoryPresetMap\.get\(value\)\|\|value;/);
  assert.match(source,/category:categoryOf\(item\)/,'saved product category must remain the stored canonical value');
  assert.match(source,/value=\{category\}>\{categoryLabel\(category\)\}<\/option>/,'category filter must keep the canonical option value and localize only its label');
  assert.match(source,/categoryLabel\(categoryOf\(item\)\)/,'catalog category chip must use the active-language label');
  assert.match(source,/this\.state\.category\?categoryLabel\(this\.state\.category\)/,'active category heading must use the active-language label');
});
