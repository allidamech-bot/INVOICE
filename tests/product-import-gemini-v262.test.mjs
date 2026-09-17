import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync(new URL('../api/product-import-ai.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../src/lib/product-import-ai.ts',import.meta.url),'utf8');

test('Gemini import endpoint keeps the key server-side and limits shared supplier data',()=>{
  assert.match(api,/process\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(client,/GEMINI_API_KEY|generativelanguage\.googleapis\.com/);
  assert.match(api,/MAX_COLUMNS=40/);
  assert.match(api,/MAX_SAMPLES=4/);
  assert.match(api,/MAX_SAMPLE_CHARS=120/);
  assert.match(api,/sameOriginRequest/);
  assert.match(api,/rateAllowed/);
});

test('Gemini import mapping is structured and cannot invent catalog values',()=>{
  assert.match(api,/responseMimeType:'application\/json'/);
  assert.match(api,/responseSchema:schema/);
  assert.match(api,/Never invent values/);
  assert.match(api,/purchase cost unless the heading explicitly says sale/);
  assert.match(api,/ALLOWED_FIELDS/);
  assert.match(api,/temperature:0/);
});

test('client sends only unresolved columns and protects high-confidence local mappings',()=>{
  assert.match(client,/column\.confidence==='low'\|\|column\.confidence==='unmapped'\|\|!mapping\[column\.index\]/);
  assert.match(client,/column\.confidence==='high'/);
  assert.match(client,/suggestion\.confidence==='low'/);
  assert.match(client,/X-Requested-With':'LOUREX-Invoice'/);
});
