import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('a stale device fast-forwards only with a verified anchor and fails closed on ambiguous divergence',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/if\(!anchor\)return 'diverged'/);
  assert.match(cloud,/if\(localChanged&&remoteChanged\)return 'diverged'/);
  const reconcile=cloud.slice(cloud.indexOf('export async function reconcileCloudVault'));
  assert.match(reconcile,/if\(remoteChanged\)\{\s*if\(!startup\)return 'diverged';\s*await installCloudVault\(uid\);return 'pulled';\s*\}/);
  assert.match(reconcile,/const startup=Boolean\(document\.querySelector\('\.loading-screen'\)\)/);
  assert.doesNotMatch(reconcile,/if\(remoteChanged\)\{\s*await installCloudVault/);
  assert.doesNotMatch(cloud,/if\(!anchor\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  const push=cloud.slice(cloud.indexOf('export async function pushLocalVaultToCloud'),cloud.indexOf('// Compatibility exports'));
  assert.match(push,/if\(!anchor\)return 'remote-changed'/);
  assert.match(push,/if\(remoteChanged\)return 'remote-changed'/);
  assert.doesNotMatch(push,/installCloudVault/);
  assert.doesNotMatch(cloud,/Nothing was overwritten|Both copies are safe/);
});

test('cross-device updates announce a safe explicit refresh instead of silently overwriting workspace',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/subscribeCloudVaultChanges/);
  assert.match(freshness,/cloudRemoteChangedSinceAnchor\(user\.uid\)/);
  assert.match(freshness,/if\(!appIsSafeToApply\(\)\)return/);
  assert.match(freshness,/window\.dispatchEvent\(new Event\('lourex-cloud-refresh-available'\)\)/);
  assert.doesNotMatch(freshness,/await reconcileCloudVault\(|window\.location\.reload\(\)/,
    'remote changes must be announced without silently replacing the active workspace');
  const entry=await read('src/app/index.tsx');
  assert.match(entry,/window\.addEventListener\('lourex-cloud-refresh-available',showCloudRefreshAvailable\)/);
  assert.match(entry,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{/);
  assert.match(entry,/reload\.addEventListener\('click'/);
});

test('missing local account link is repaired for the already authenticated account',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/if\(!linked\)/);
  assert.match(freshness,/putCloudAccount\(user\.uid,user\.email\)/);
  assert.match(freshness,/linked\.uid!==user\.uid/);
});

test('account revisions never use wall clock time to choose a winner',async()=>{
  const [cloud,app]=await Promise.all([read('src/cloud/firebase.ts'),read('src/app/App.tsx')]);
  assert.doesNotMatch(cloud,/remote\.updatedAt\s*[<>]=?\s*local\.updatedAt/);
  assert.doesNotMatch(app,/remote\.updatedAt\s*[<>]=?\s*local\.updatedAt/);
  assert.match(app,/cloudRemoteChangedSinceAnchor\(user\.uid\)/);
  assert.match(cloud,/remote\.revision!==anchor\.revision/);
  assert.match(cloud,/commitMetaIfUnchanged/);
});

test('UI rehydrates after cloud layer fast-forwards a stale legacy push',async()=>{
  const entry=await read('src/app/index.tsx');
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/lourex-cloud-applied/);
  assert.match(entry,/addEventListener\('lourex-cloud-applied'/);
  assert.match(entry,/window\.location\.reload\(\)/);
});
