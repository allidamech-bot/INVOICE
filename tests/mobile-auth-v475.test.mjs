import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

// Compatibility filename retained because CI executes every changed top-level test,
// including deleted paths. The v475 implementation itself is retired; this contract
// proves secure-access presentation is now owned by v480.
test('v475 auth presentation is retired in favor of v480 secure-access ownership',async()=>{
  const [bridge,v480]=await Promise.all([
    read('src/styles/tailadmin-reliability-bridge-v320.css'),
    read('src/styles/executive-overlays-auth-v480.css')
  ]);
  assert.doesNotMatch(bridge,/mobile-auth-v475\.css/);
  assert.match(bridge,/executive-overlays-auth-v480\.css\?v=480-4/);
  for(const selector of ['.ta-auth-page','.ta-auth-card','.ta-setup-card','.ta-unlock-card','.auth-recovery-state'])assert.ok(v480.includes(selector),`v480 secure-access owner is missing ${selector}`);
  assert.match(v480,/Noto Sans Arabic/);
  assert.match(v480,/safe-area-inset-bottom/);
  assert.match(v480,/min-height:44px/);
});

test('v480 secure-access presentation cannot own auth or vault mutations',async()=>{
  const css=await read('src/styles/executive-overlays-auth-v480.css');
  for(const token of ['firebase','indexedDB','localStorage','resumeVaultSession','setState(','signOutCloudUser','clearSession','vault.'])assert.ok(!css.includes(token),`presentation CSS contains forbidden mutation token ${token}`);
});
