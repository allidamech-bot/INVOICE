import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('iOS standalone resumes cloud freshness aggressively without relying only on realtime',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/matchMedia\('\(display-mode: standalone\)'\)/);
  assert.match(freshness,/navigator\.standalone/);
  assert.match(freshness,/pageshow/);
  assert.match(freshness,/visibilitychange/);
  assert.match(freshness,/focus/);
  assert.match(freshness,/cloudRemoteChangedSinceAnchor/);
  assert.match(freshness,/reconcileCloudVault/);
  assert.match(freshness,/standalone\?1_500:5_000/);
});

test('service worker promotes fresh app runtime for installed PWA',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/const CACHE = 'lourex-invoice-v160'/);
  assert.match(sw,/self\.skipWaiting\(\)/);
  assert.match(sw,/self\.clients\.claim\(\)/);
  assert.match(sw,/networkFirst\(event\.request\)/);
});
