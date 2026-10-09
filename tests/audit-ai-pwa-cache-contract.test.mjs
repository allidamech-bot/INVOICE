import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('service worker includes the current cloud coalescing runtime without an obsolete cache-generation assertion',async()=>{
  const [patch,sw,distSw]=await Promise.all([read('scripts/pwa-cache-v205.mjs'),read('public/sw.js'),read('dist/sw.js')]);
  assert.ok(patch.includes('./src/cloud/coalescing.js'),'the cache generator must include the cloud module');
  assert.ok(distSw.includes('./src/cloud/coalescing.js'),'the built service worker must precache the cloud module');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v\d+';$/m,'the source service worker must declare its own active cache');
  // Several old declarations survive exclusively inside release-history comments.
  // Strip inert block comments before counting executable cache declarations.
  const executableSw=distSw.replace(/\/\*[\s\S]*?\*\//g,'');
  const active=[...executableSw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  assert.equal(active.length,1,'built PWA must have exactly one active application cache generation');
  assert.ok(Number(active[0][1])>=228,'the current cache must not regress behind the cloud scheduling release');
  assert.match(distSw,/key!==CACHE&&key\.startsWith\(APP_CACHE_PREFIX\)/);
});
