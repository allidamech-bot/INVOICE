import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('build pipeline emits a fresh installed-PWA marker for v257 runtime fixes',async()=>{
  const patch=await readFile('scripts/pwa-cache-v205.mjs','utf8');
  assert.match(patch,/lourex-invoice-v257: localized financial input and RTL numeric isolation refresh/);
});
