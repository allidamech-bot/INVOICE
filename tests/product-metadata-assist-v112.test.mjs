import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { categoryChoices } from '../dist/src/lib/product-presets.js';

const read=path=>readFile(path,'utf8');

test('v112 provides broad bilingual category choices without inventing HS classifications',async()=>{
  const categories=categoryChoices(false).map(choice=>choice.value);
  for(const value of ['Beverages','Energy Drinks','Soft Drinks','Juices','Chocolate','Biscuits','Snacks','Food','Personal Care','Household','Perfumes','Packaging','Other']){
    assert.ok(categories.includes(value),`missing category ${value}`);
  }
  assert.ok(categories.length>=20);

  const ar=categoryChoices(true).find(choice=>choice.value==='Energy Drinks');
  assert.ok(ar?.label.includes('مشروبات طاقة'));

  const presets=await read('src/lib/product-presets.ts');
  assert.doesNotMatch(presets,/HS_CODE_CHOICES|HS_CODES|staticHs/i,'HS codes must come from the user\'s prior data, not a static guessed catalog');
});

test('v112 makes saved-item category, tags and HS code reusable with one-tap suggestions',async()=>{
  const saved=await read('src/components/SavedItemsModal.tsx');

  assert.match(saved,/categoryChoices/);
  assert.match(saved,/categorySuggestions/);
  assert.match(saved,/product-metadata-suggestions/);
  assert.match(saved,/saved-item-tag-suggestions/);
  assert.match(saved,/toggleTag/);
  assert.match(saved,/rankedMetadata\(this\.props\.items,item=>item\.tags/);
  assert.match(saved,/saved-item-hs-suggestions/);
  assert.match(saved,/rankedMetadata\(this\.props\.items,item=>item\.hsCode/);
  assert.match(saved,/Previous HS codes|أكواد HS السابقة/);
  assert.match(saved,/Custom category|تصنيف مخصص/);
});

test('v112 reuses prior HS codes inside direct invoice item editing too',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');

  assert.match(editor,/function priorHsCodes\(/);
  assert.match(editor,/sortSavedItems\(savedItems\)/);
  assert.match(editor,/historySuggestions\(documents\)/);
  assert.match(editor,/const hsCodeSuggestions=priorHsCodes/);
  assert.match(editor,/editor-hs-suggestions/);
  assert.match(editor,/onClick=\{\(\)=>this\.item\(i\.id,'hsCode',code\)\}/);
});

test('product metadata controls remain touch-safe, app-only and available offline',async()=>{
 const [css,html,sw,bundle]=await Promise.all([read('src/styles/product-metadata-assist-v112.css'),read('index.html'),read('dist/sw.js'),read('dist/styles/app.bundle.css')]);
 assert.ok(css.includes('product-metadata-suggestions')&&css.includes('@media (max-width:720px)'));
 assert.ok(!css.includes('.invoice-page'),'product metadata controls must not affect A4');
 assert.ok(html.includes('product-metadata-assist-v112.css'));
 assert.ok(html.indexOf('product-metadata-assist-v112.css')>html.indexOf('performance-polish-v100.css'));
 assert.ok(bundle.includes('product-metadata-assist-v112.css'));
 assert.ok(sw.includes('styles/app.bundle.css'));
});

