import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v321 boot watchdog is loaded before the application module and never clears business storage',async()=>{
  const [html,watchdog,cacheRefresh]=await Promise.all([
    read('index.html'),
    read('public/startup-watchdog-v321.js'),
    read('scripts/v303-visual-cache-refresh.mjs')
  ]);

  const watchdogScript=html.indexOf('./startup-watchdog-v321.js?v=321');
  const appModule=html.indexOf('./src/app/index.js');
  assert.ok(watchdogScript>=0,'v321 startup watchdog must be present in index.html');
  assert.ok(appModule>watchdogScript,'startup watchdog must execute before the React application module');

  assert.match(watchdog,/CHECK_MS=9000/);
  assert.match(watchdog,/navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(watchdog,/caches\.keys\(\)/);
  assert.match(watchdog,/CACHE_PREFIX='lourex-invoice-'/);
  assert.doesNotMatch(watchdog,/indexedDB\.deleteDatabase/);
  assert.doesNotMatch(watchdog,/localStorage\.clear\(\)/);
  assert.doesNotMatch(watchdog,/sessionStorage\.clear\(\)/);
  assert.match(watchdog,/\.\/health\.html/);

  assert.match(cacheRefresh,/RELEASE_GENERATION=321/);
  assert.match(cacheRefresh,/startup-watchdog-v321\.js\?v=321/);
});
