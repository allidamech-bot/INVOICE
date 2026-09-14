import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v251 keeps the default LOUREX logo as a self-contained vector asset Safari can render',async()=>{
  const svg=await read('public/brand/lourex-logo.svg');
  assert.match(svg,/^<svg[\s\S]*<\/svg>\s*$/);
  assert.doesNotMatch(svg,/<image\b/i);
  assert.doesNotMatch(svg,/data:image\//i);
  assert.match(svg,/<path\b/);
  assert.match(svg,/viewBox="0 0 1024 1024"/);
});

test('v251 refreshes installed clients so stale broken logo responses are replaced',async()=>{
  const runtime=await read('scripts/desktop-runtime-v249.mjs');
  assert.match(runtime,/lourex-invoice-v251: Safari-safe brand asset refresh/);
  assert.match(runtime,/LOGO_RELEASE_MARKER/);
});
