import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v351 pull-to-refresh is opt-in, Apple-disabled and blocked on command/editor surfaces',async()=>{
  const source=await read('public/pull-to-refresh.js');
  assert.match(source,/platform==='MacIntel'&&touchPoints>1/);
  assert.match(source,/if\(appleMobile\|\|!document\.documentElement\.hasAttribute\('data-lourex-enable-pull-refresh'\)\)return/);
  assert.match(source,/if\(!document\.documentElement\.hasAttribute\('data-lourex-enable-pull-refresh'\)\)return false/);
  assert.match(source,/__LOUREX_IOS_WEBKIT__/);
  assert.match(source,/data-lourex-document-editor/);
  assert.match(source,/\.editor-screen/);
  assert.match(source,/\.ta-mobile-sheet/);
  assert.match(source,/\.ta-create-menu-mobile/);
  assert.match(source,/\.global-search-panel/);
  assert.match(source,/\.ta-doc-mobile-action-portal/);
});

test('v351 generated runtime config is configuration-only and has no hidden boot navigation',async()=>{
  const source=await read('scripts/build.mjs');
  assert.match(source,/runtime-config\.js is configuration only/);
  assert.match(source,/window\.__LOUREX_RUNTIME__/);
  assert.doesNotMatch(source,/stuckBootRecovery/);
  const runtimeBlock=source.slice(source.indexOf('// runtime-config.js is configuration only.'),source.indexOf("let html = await readFile('index.html'"));
  assert.doesNotMatch(runtimeBlock,/location\.(?:reload|replace)/);
  assert.doesNotMatch(runtimeBlock,/SKIP_WAITING/);
});

test('v351 Apple stability runtime recognizes iPad Desktop Website and retires reload-producing PWA state',async()=>{
  const source=await read('public/editor-stability-v338.js');
  assert.match(source,/platform==='MacIntel'&&touchPoints>1/);
  assert.match(source,/root\.dataset\.lourexIosWebkit='true'/);
  assert.match(source,/root\.removeAttribute\('data-lourex-enable-pull-refresh'\)/);
  assert.match(source,/navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(source,/keys\.filter\(key=>key\.startsWith\('lourex-invoice-'\)\)/);
});
