import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('a stale device fast-forwards to the authoritative account copy automatically',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/if\(!anchor\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  assert.match(cloud,/if\(remoteChanged\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  assert.match(cloud,/if\(remoteChanged\)\{const installed=await installCloudVault\(uid,true\)/);
  assert.doesNotMatch(cloud,/Nothing was overwritten|Both copies are safe/);
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
  const cloud=await read('src/cloud/firebase.ts');
  assert.doesNotMatch(cloud,/remote\.updatedAt\s*[<>]=?\s*local\.updatedAt/);
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
