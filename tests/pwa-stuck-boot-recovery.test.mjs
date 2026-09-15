import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

function recoveryBlocks(runtime){
  const stuckStart=runtime.indexOf('function bootOnly(){');
  const desktopStart=runtime.indexOf("var RECOVERY_KEY='lourex-desktop-boot-recovery-v249'");
  const authGateway=runtime.indexOf("var TRANSITION_KEY='lourex-auth-gateway-transition-v253'",desktopStart);
  assert.ok(stuckStart>=0,'stuck-boot recovery block must exist');
  assert.ok(desktopStart>stuckStart,'desktop boot recovery block must follow stuck-boot recovery');
  return {
    stuck:runtime.slice(stuckStart,desktopStart),
    desktop:runtime.slice(desktopStart,authGateway>desktopStart?authGateway:runtime.length)
  };
}

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
  const {stuck,desktop}=recoveryBlocks(runtime);

  // The network-fresh stuck-boot rescue owns the update/install retry contract.
  assert.match(stuck,/function bootOnly\(\)/);
  assert.match(stuck,/document\.getElementById\('lourex-boot'\)/);
  assert.match(stuck,/!document\.querySelector\('\.app-ui,\.auth-page'\)/);
  assert.match(stuck,/if\(reloading\|\|!bootOnly\(\)\)return/);
  assert.doesNotMatch(stuck,/localStorage|indexedDB|putSecurityAndVault|clearSession|deleteDatabase/);

  // Desktop v249 has its own one-shot marker and broader desktop/network gates.
  assert.match(desktop,/var RECOVERY_KEY='lourex-desktop-boot-recovery-v249'/);
  assert.match(desktop,/function bootOnly\(\)/);
  assert.match(desktop,/sessionStorage\.getItem\(RECOVERY_KEY\)==='1'/);
  assert.match(desktop,/sessionStorage\.setItem\(RECOVERY_KEY,'1'\)/);
  assert.doesNotMatch(desktop,/localStorage|indexedDB|putSecurityAndVault|clearSession|deleteDatabase/);
  assert.doesNotMatch(desktop,/sessionStorage\.(?:clear|removeItem)\(/);
});

test('stuck boot rescue retries long enough for a waiting worker to finish installing on slow iPhone networks',async()=>{
  const runtime=await read('dist/runtime-config.js');
  assert.match(runtime,/setTimeout\(function\(\)\{void rescue\(\);\},750\)/);
  assert.match(runtime,/setTimeout\(function\(\)\{void rescue\(\);\},2500\)/);
  assert.match(runtime,/setTimeout\(function\(\)\{void rescue\(\);\},6000\)/);
  assert.match(runtime,/installing\.addEventListener\('statechange',onStateChange\)/);
});
