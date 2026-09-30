import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v450 AI core preserves product rows whose currency is genuinely unknown',async()=>{
  const source=await read('api/ai-core.js');
  assert.match(source,/function cleanBusinessProduct\(row\)\{[^\n]*if\(!id\|\|!name\)return null;/);
  assert.doesNotMatch(source,/function cleanBusinessProduct\(row\)\{[^\n]*if\(!id\|\|!name\|\|!currency\)return null;/);
  assert.match(source,/function cleanPricingRow\(row\)\{[^\n]*if\(!id\|\|!name\|\|!policyMethod\|\|!pricingHealth\)return null;/);
  assert.doesNotMatch(source,/function cleanPricingRow\(row\)\{[^\n]*!currency/);
  assert.match(source,/function cleanProductRow\(row\)\{[^\n]*if\(!name\)return null;/);
  assert.match(source,/unknown-product-currency-remains-empty/);
  assert.match(source,/An empty product\/pricing currency means the currency is not recorded/);
});

test('v450 AI core keeps incomplete active drafts visible for review but does not invent line quantity or unit',async()=>{
  const source=await read('api/ai-core.js');
  assert.match(source,/function cleanDraftActiveDocument\(value\)\{[^\n]*if\(!id\|\|!number\|\|!kind\|\|!status\)return null;/);
  assert.doesNotMatch(source,/function cleanDraftActiveDocument\(value\)\{[^\n]*!currency\)return null;/);
  assert.match(source,/function cleanGeneratedItem\(row\)\{[^\n]*const quantity=cleanPositive\(row\.quantity,true\),unit=cleanText\(row\.unit,40\)/);
  assert.match(source,/if\(!quantity\|\|!unit\)return null/);
  assert.doesNotMatch(source,/cleanPositive\(row\.quantity\)\|\|'1'/);
  assert.doesNotMatch(source,/cleanText\(row\.unit,40\)\|\|'PCS'/);
  assert.match(source,/never default quantity to 1 or unit to PCS/);
});
