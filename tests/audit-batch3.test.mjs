import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('configured devices restore their encrypted local session before background cloud reconciliation',async()=>{
  const app=await read('src/app/App.tsx');
  const initialize=app.slice(app.indexOf('private initialize=async'),app.indexOf('private initializeConfiguredCloud'));
  assert.ok(initialize.indexOf('await hasSecurity()')>=0);
  assert.ok(initialize.indexOf('resumeVaultSession()')>=0);
  assert.ok(initialize.indexOf('resumeVaultSession()')<initialize.indexOf('waitForCloudUser()'),'local encrypted session restore must precede background cloud reconciliation');
  assert.match(initialize,/loading:false,firstRun:false,unlocked:true/);
  assert.match(initialize,/void this\.initializeConfiguredCloud\(\)/);
});

test('newer remote revisions are reconciled automatically without a manual sync event',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/cloudRemoteChangedSinceAnchor/);
  assert.match(freshness,/reconcileCloudVault/);
  assert.match(freshness,/result==='pulled'/);
  assert.match(freshness,/window\.location\.reload\(\)/);
  assert.doesNotMatch(freshness,/lourex-cloud-remote-newer/);
  assert.doesNotMatch(freshness,/dispatchEvent\(new Event\('online'\)\)/);
});

test('cloud freshness watcher repairs a missing link only for the authenticated account',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/let linked=await getCloudAccount\(\)/);
  assert.match(freshness,/if\(!linked\)/);
  assert.match(freshness,/putCloudAccount\(user\.uid,user\.email\)/);
  assert.match(freshness,/if\(linked\.uid!==user\.uid\)/);
});

test('all Firebase sign-in entry points mark the just-signed-in restoration window',async()=>{
  const firebase=await read('src/cloud/firebase.ts');
  assert.match(firebase,/function markRecentAuth/);
  assert.match(firebase,/createCloudUser[\s\S]*markRecentAuth\(\);return user/);
  assert.match(firebase,/signInCloudUser[\s\S]*markRecentAuth\(\);return user/);
  assert.match(firebase,/recent\?10_000:5_000/);
});

test('installed PWA keeps one same-origin JS/CSS generation until an explicit update activates',async()=>{
  const [sw,entry]=await Promise.all([read('public/sw.js'),read('src/app/index.tsx')]);
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/pathname\.startsWith\('\/src\/'\)/);
  assert.match(sw,/pathname\.startsWith\('\/styles\/'\)/);
  assert.match(sw,/isAppRuntimePath\(url\.pathname\)/);
  assert.match(sw,/async function cacheFirst\(request\)/);
  assert.match(sw,/const cached=await cache\.match\(request\)/);
  assert.match(sw,/if\(cached\)return cached/);
  assert.match(sw,/event\.respondWith\(cacheFirst\(event\.request\)\)/);
  assert.match(entry,/registration\.update\(\)/);
  assert.match(entry,/waiting\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
});