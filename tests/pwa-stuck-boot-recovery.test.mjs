import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('network-fresh runtime config can rescue an old PWA that is still trapped on the static boot shell',async()=>{
  const [build,runtime,sw,vercel,html]=await Promise.all([
    read('scripts/build.mjs'),
    read('dist/runtime-config.js'),
    read('public/sw.js'),
    read('vercel.json'),
    read('index.html')
  ]);

  assert.match(html,/#lourex-boot\.loading-screen\{position:fixed;inset:0;z-index:2147483000/);
  assert.match(sw,/runtime-config\.js[\s\S]*cache:'no-store'/);
  assert.match(vercel,/"source": "\/runtime-config\.js"[\s\S]*"no-cache, no-store, must-revalidate"/);

  for(const source of [build,runtime]){
    assert.match(source,/lourex-boot/);
    assert.match(source,/\.app-ui,\.auth-page/);
    assert.match(source,/serviceWorker\.getRegistration\(\)/);
    assert.match(source,/registration\.update\(\)/);
    assert.match(source,/registration\.waiting/);
    assert.match(source,/waiting\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
    assert.match(source,/controllerchange/);
    assert.match(source,/window\.location\.replace\(window\.location\.href\)/);
  }
});

test('boot rescue is gated to pre-React state and never touches encrypted or local application data',async()=>{
  const runtime=await read('dist/runtime-config.js');
  assert.match(runtime,/function bootOnly\(\)/);
  assert.match(runtime,/document\.getElementById\('lourex-boot'\)/);
  assert.match(runtime,/!document\.querySelector\('\.app-ui,\.auth-page'\)/);
  assert.match(runtime,/if\(reloading\|\|!bootOnly\(\)\)return/);
  assert.doesNotMatch(runtime,/localStorage|sessionStorage|indexedDB|putSecurityAndVault|clearSession|deleteDatabase/);
});

test('stuck boot rescue retries long enough for a waiting worker to finish installing on slow iPhone networks',async()=>{
  const runtime=await read('dist/runtime-config.js');
  assert.match(runtime,/setTimeout\(function\(\)\{void rescue\(\);\},750\)/);
  assert.match(runtime,/setTimeout\(function\(\)\{void rescue\(\);\},2500\)/);
  assert.match(runtime,/setTimeout\(function\(\)\{void rescue\(\);\},6000\)/);
  assert.match(runtime,/installing\.addEventListener\('statechange',onStateChange\)/);
});
