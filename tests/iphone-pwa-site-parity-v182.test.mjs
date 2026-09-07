import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v182 parity remains preserved after later immutable PWA cache generations',async()=>{
  const [sw,product]=await Promise.all([
    read('public/sw.js'),
    read('src/components/ProductLibraryWorkspace.tsx')
  ]);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v183';$/m);
  assert.match(sw,/lourex-invoice-v182: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v179: preserved as a legacy marker/);
  assert.ok(sw.includes('./src/components/ProductLibraryWorkspace.js'));
  assert.match(product,/lastUnitCost/);
  assert.match(product,/favoriteOnly/);
});

test('installed iPhone PWA resumes cloud freshness checks after focus, pageshow, visibility and reconnect',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/matchMedia\?\.\('\(display-mode: standalone\)'\)/);
  assert.match(freshness,/navigator as Navigator&\{standalone\?:boolean\}/);
  assert.match(freshness,/window\.addEventListener\('focus',onFocus\)/);
  assert.match(freshness,/window\.addEventListener\('online',onOnline\)/);
  assert.match(freshness,/window\.addEventListener\('pageshow',onPageshow\)/);
  assert.match(freshness,/document\.addEventListener\('visibilitychange',onVisibility\)/);
  assert.match(freshness,/standalone\?1_500:5_000/);
});

test('PWA updates never force-reload an active document or data-entry workspace',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.match(entry,/function reloadUnsafeWorkspaceOpen\(\):boolean/);
  assert.match(entry,/\.editor-screen/);
  assert.match(entry,/\.operations-page/);
  assert.match(entry,/\.product-library-pro\.editor-open/);
  assert.match(entry,/\.modal-backdrop/);
  assert.match(entry,/waiting\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
  assert.match(entry,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}/);
});
