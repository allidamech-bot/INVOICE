import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('a stale or anchorless device never auto-installs cloud over a different local vault',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/if\(!anchor\)throw new Error\('Cloud sync paused to protect local data/);
  assert.match(cloud,/if\(remoteChanged&&localChanged\)throw new Error\('Cloud sync paused because local and cloud data both changed/);
  assert.match(cloud,/if\(remoteChanged\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  const push=cloud.slice(cloud.indexOf('export async function pushLocalVaultToCloud'),cloud.indexOf('// Compatibility exports'));
  assert.match(push,/if\(!anchor\)return 'remote-changed'/);
  assert.match(push,/if\(remoteChanged\)return 'remote-changed'/);
  assert.doesNotMatch(push,/installCloudVault/);
  assert.doesNotMatch(cloud,/if\(!anchor\)\{await installCloudVault\(uid\);return 'pulled';\}/);
});

test('cross-device updates use Firestore realtime events and automatic account reconcile',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/subscribeCloudVaultChanges/);
  assert.match(freshness,/reconcileCloudVault/);
  assert.match(freshness,/result==='pulled'/);
  assert.match(freshness,/window\.location\.reload\(\)/);
  assert.match(freshness,/5_000/);
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

test('UI rehydrates after an explicitly applied cloud vault',async()=>{
  const entry=await read('src/app/index.tsx');
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/lourex-cloud-applied/);
  assert.match(entry,/addEventListener\('lourex-cloud-applied'/);
  assert.match(entry,/window\.location\.reload\(\)/);
});
