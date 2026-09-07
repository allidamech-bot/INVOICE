import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('saved-item workspace exposes internal cost without changing customer document output',async()=>{
  const [workspace,renderer]=await Promise.all([
    read('src/components/ProductLibraryWorkspace.tsx'),
    read('src/templates/TemplateRenderer.tsx'),
  ]);
  assert.match(workspace,/lastUnitCost/);
  assert.match(workspace,/lastCostCurrency/);
  assert.match(workspace,/Unit cost \(internal\)/);
  assert.match(workspace,/never printed on customer documents/);
  assert.doesNotMatch(renderer,/lastUnitCost|lastCostCurrency/);
});

test('saved-item workspace validates and normalizes reusable costs',async()=>{
  const workspace=await read('src/components/ProductLibraryWorkspace.tsx');
  assert.match(workspace,/isDecimalInput\(cost\)/);
  assert.match(workspace,/decimalToScaled\(cost\)<0n/);
  assert.match(workspace,/lastUnitCost:cost\?normalizeDecimalInput\(cost\):''/);
  assert.match(workspace,/lastCostCurrency:cost\?/);
});

test('favorites metric is an actual catalog filter and clear filters resets it',async()=>{
  const workspace=await read('src/components/ProductLibraryWorkspace.tsx');
  assert.match(workspace,/favoriteOnly:boolean/);
  assert.match(workspace,/!this\.state\.favoriteOnly\|\|Boolean\(item\.favorite\)/);
  assert.match(workspace,/clearFilters=\(\)=>this\.setState\(\{query:'',category:'',favoriteOnly:false\}\)/);
  assert.match(workspace,/Favorite products/);
});
