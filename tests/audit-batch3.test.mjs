import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('configured devices hydrate the Firebase UID workspace before displaying account data',async()=>{
  const app=await read('src/app/App.tsx');
  const initialize=app.slice(app.indexOf('private initialize=async'),app.indexOf('private activity='));
  assert.match(initialize,/const user=await waitForCloudUser\(\)/);
  assert.match(initialize,/await activateAccountStorage\(user\.uid\)/);
  assert.match(initialize,/let local=await getPlainWorkspace\(\)/);
  assert.match(initialize,/await reconcilePlainCloudWorkspace\(user\.uid\)/);
  assert.match(initialize,/loading:false,firstRun:false,unlocked:true,vault/);
  assert.doesNotMatch(initialize,/resumeVaultSession\(|unlockVault\(|hasSecurity\(/);
});

test('newer remote revisions are surfaced without destructive automatic reloads',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/cloudRemoteChangedSinceAnchor/);
  assert.match(freshness,/subscribeCloudVaultChanges/);
  assert.match(freshness,/lourex-cloud-refresh-available/);
  assert.doesNotMatch(freshness,/reconcileCloudVault/);
  assert.doesNotMatch(freshness,/window\.location\.reload\(\)/);
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
