import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v321 production boot uses the vendorable ReactDOM runtime and a data-safe startup watchdog',async()=>{
  const [html,watchdog,cacheRefresh,build,vercel]=await Promise.all([
    read('index.html'),
    read('public/startup-watchdog-v321.js'),
    read('scripts/v303-visual-cache-refresh.mjs'),
    read('scripts/build.mjs'),
    read('vercel.json')
  ]);

  // v320 accidentally changed this to react-dom/.../react.production.min.js.
  // That URL is not the ReactDOM runtime and it also bypasses build.mjs's local
  // vendor replacement, leaving Production dependent on a CDN blocked by CSP.
  const reactDomRuntime='https://cdn.jsdelivr.net/npm/react-dom@17.0.2/umd/react-dom.production.min.js';
  assert.ok(html.includes(reactDomRuntime),'index.html must request the canonical ReactDOM UMD runtime');
  assert.doesNotMatch(html,/react-dom@17\.0\.2\/umd\/react\.production\.min\.js/);
  assert.ok(build.includes(`['${reactDomRuntime}','./vendor/react-dom.production.min.js']`),'production build must vendor the exact ReactDOM URL used by index.html');
  assert.doesNotMatch(vercel,/script-src[^\n]*cdn\.jsdelivr\.net/,'Production CSP must not rely on jsDelivr for application runtime JavaScript');

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
