import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v249 runs desktop runtime hardening after the established PWA build',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=pkg.scripts.build;
  const pwa=build.indexOf('node scripts/pwa-cache-v205.mjs');
  const desktop=build.indexOf('node scripts/desktop-runtime-v249.mjs');
  assert.ok(pwa>=0,'PWA cache hardening must remain in the build');
  assert.ok(desktop>pwa,'desktop runtime hardening must run after PWA cache generation');
});

test('v249 repairs only a genuinely broken desktop boot without deleting business data',async()=>{
  const script=await read('scripts/desktop-runtime-v249.mjs');
  for(const marker of [
    '__LOUREX_BOOT_RUNTIME_LOADED__',
    'lourex-desktop-boot-recovery-v249',
    'navigator.onLine',
    'window.innerWidth<=960',
    "(pointer:fine)",
    'registration.unregister()',
    'caches.keys()',
    '/^lourex-invoice-v/i',
    'health.html',
    'desktop startup recovery refresh'
  ])assert.ok(script.includes(marker),marker);
  assert.doesNotMatch(script,/indexedDB\.deleteDatabase/,'desktop recovery must never delete the encrypted account database');
  assert.doesNotMatch(script,/localStorage\.clear/,'desktop recovery must never clear account/session metadata wholesale');
  assert.match(script,/window\.__LOUREX_BOOT_RUNTIME_LOADED__\|\|recoveryUsed\(\)/,'a running app or an already attempted repair must block destructive retry loops');
});

test('v249 production build publishes the runtime marker, recovery guard and fresh worker marker',async()=>{
  const [runtime,entry,sw]=await Promise.all([
    read('dist/runtime-config.js'),
    read('dist/src/app/index.js'),
    read('dist/sw.js')
  ]);
  assert.match(runtime,/lourex-desktop-boot-recovery-v249/);
  assert.match(runtime,/registration\.unregister\(\)/);
  assert.match(entry,/__LOUREX_BOOT_RUNTIME_LOADED__/);
  assert.match(sw,/lourex-invoice-v249: desktop startup recovery refresh/);
});

test('v249 browser gate exercises real laptop-width desktop navigation in both directions',async()=>{
  const runner=await read('tests/visual/run-functional-navigation-auth-v200.cjs');
  for(const marker of [
    'width:1366,height:768',
    '.workspace-sidebar',
    '.shell-create-button',
    '#desktop-new-document-menu',
    '.shell-settings-row',
    '.shell-account-row',
    '.shell-account-button',
    'Desktop sidebar must be visible at laptop width',
    'Arabic desktop sidebar must occupy the right rail',
    'English desktop sidebar must occupy the left rail'
  ])assert.ok(runner.includes(marker),marker);
});
