import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v253 runtime guard follows Firebase auth state only while the public account gateway is visible',async()=>{
  const runtime=await read('scripts/desktop-runtime-v249.mjs');
  const block=runtime.slice(runtime.indexOf('const authGatewayTransition='),runtime.indexOf("if(!runtimeConfig.includes('lourex-desktop-boot-recovery-v249')"));
  assert.match(block,/lourex-auth-gateway-transition-v253/);
  assert.match(block,/onAuthStateChanged/);
  assert.match(block,/document\.querySelector\('\.auth-account-page'\)/);
  assert.match(block,/firebase\.auth\(\)\.currentUser/);
  assert.match(block,/window\.location\.replace\(window\.location\.href\)/);
  assert.match(block,/if\(!user\)\{clearMarker\(\);return;\}/);
});

test('v253 runtime guard is one-shot and never touches encrypted local data',async()=>{
  const runtime=await read('scripts/desktop-runtime-v249.mjs');
  const block=runtime.slice(runtime.indexOf('const authGatewayTransition='),runtime.indexOf("if(!runtimeConfig.includes('lourex-desktop-boot-recovery-v249')"));
  assert.match(block,/marker\(\)===uid/);
  assert.match(block,/sessionStorage\.setItem\(TRANSITION_KEY,uid\)/);
  assert.match(block,/sessionStorage\.removeItem\(TRANSITION_KEY\)/);
  assert.doesNotMatch(block,/indexedDB|deleteDatabase|localStorage\.clear|sessionStorage\.clear/);
  assert.match(runtime,/AUTH_GATEWAY_RELEASE_MARKER/);
  assert.match(runtime,/lourex-invoice-v253: authenticated gateway transition refresh/);
});
