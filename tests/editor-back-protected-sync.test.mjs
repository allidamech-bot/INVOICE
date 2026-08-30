import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/components/EditorPage.tsx','utf8');

test('editor save retries transient protected cloud operations instead of trapping Back navigation',()=>{
  assert.match(source,/saveWithProtectedRetry/);
  assert.match(source,/protected data operation/i);
  assert.match(source,/عملية محمية/);
  assert.match(source,/Date\.now\(\)\+12_000/);
  assert.match(source,/setTimeout\(resolve,150\)/);
  assert.match(source,/onSave=\{this\.saveWithProtectedRetry\}/);
});
