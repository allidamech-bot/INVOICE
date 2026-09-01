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

test('v112 metadata choices remain app-only, touch-friendly, cached offline and below v100',async()=>{
  const css=await read('src/styles/product-metadata-assist-v112.css');
  const index=await read('index.html');
  const sw=await read('public/sw.js');

  assert.match(css,/\.app-ui \.product-metadata-suggestions/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/@media \(pointer:coarse\)/);
  assert.match(css,/@media print/);
  assert.doesNotMatch(css,/\.invoice-page|\.items-table|\.doc-header|\.totals-block/);

  const metadataCss='./styles/product-metadata-assist-v112.css';
  const performanceCss='./styles/performance-polish-v100.css';
  assert.ok(index.includes(metadataCss));
  assert.ok(index.indexOf(metadataCss)<index.indexOf(performanceCss));
  assert.match(sw,/\.\/styles\/product-metadata-assist-v112\.css/);
  assert.match(sw,/v112/);
  assert.match(sw,/v111/);
  assert.match(sw,/v110/);
  assert.match(sw,/v103/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v101'/);
});
