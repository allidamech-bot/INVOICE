import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test('production boot uses vendored ReactDOM and the explicit no-data-loss startup recovery',async()=>{
  const [html,watchdog,cacheRefresh,build,vercel]=await Promise.all([
    read('index.html'),read('public/startup-watchdog-v321.js'),
    read('scripts/v303-visual-cache-refresh.mjs'),read('scripts/build.mjs'),read('vercel.json')
  ]);
  const reactDomRuntime='https://cdn.jsdelivr.net/npm/react-dom@17.0.2/umd/react-dom.production.min.js';
  assert.ok(html.includes(reactDomRuntime));
  assert.doesNotMatch(html,/react-dom@17\.0\.2\/umd\/react\.production\.min\.js/);
  assert.ok(build.includes("['"+reactDomRuntime+"','./vendor/react-dom.production.min.js']"));
  assert.doesNotMatch(vercel,/script-src[^\n]*cdn\.jsdelivr\.net/);
  const watchdogScript=html.indexOf('<script src="./startup-watchdog-v321.js?v=347"></script>');
  const appModule=html.indexOf('<script type="module" src="./src/app/index.js"></script>');
  assert.ok(watchdogScript>=0&&appModule>watchdogScript,
    'startup safety script must execute before React');
  assert.match(watchdog,/CHECK_MS=12000/);
  assert.match(watchdog,/function editingWorkspaceOpen\(\)/);
  assert.match(watchdog,/data-lourex-workspace-dirty/);
  assert.match(watchdog,/function recoverIfNeeded\(\)\{\s*if\(editingWorkspaceOpen\(\)\|\|!bootStillVisible\(\)\)return;/);
  assert.match(watchdog,/refreshStaticRuntime\(\)\.finally\(function\(\)\{[\s\S]*?if\(editingWorkspaceOpen\(\)\|\|!bootStillVisible\(\)\)\{/,
    'the explicit retry must recheck unsaved work after async cleanup');
  assert.match(watchdog,/window\.setTimeout\(recoverIfNeeded,CHECK_MS\)/);
  assert.match(watchdog,/navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(watchdog,/caches\.keys\(\)/);
  assert.doesNotMatch(watchdog,/indexedDB\.deleteDatabase|localStorage\.clear\(\)|sessionStorage\.clear\(\)/);
  assert.match(watchdog,/\.\/health\.html/);
  assert.match(cacheRefresh,/RELEASE_GENERATION=361/);
  assert.match(cacheRefresh,/v337-template-layout-balance\.css\?v=337-3/);
  assert.match(cacheRefresh,/v331-draft-scroll-recovery\.css\?v=365-1/);
  assert.match(cacheRefresh,/document-entry-v302\.js\?v=361/);
  assert.match(cacheRefresh,/startup-watchdog-v321\.js\?v=347/);
});
