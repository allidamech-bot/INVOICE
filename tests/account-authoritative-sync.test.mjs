import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('multi-device freshness never trusts device wall-clock timestamps',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/cloudRemoteChangedSinceAnchor/);
  assert.doesNotMatch(freshness,/remote\.updatedAt\s*[<>]=?\s*local\.updatedAt/);
});

test('automatic reconcile fails closed when no verified anchor exists',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/if\(!anchor\)return 'diverged'/);
  assert.match(cloud,/if\(localChanged&&remoteChanged\)return 'diverged'/);
  assert.match(cloud,/if\(remoteChanged\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  assert.doesNotMatch(cloud,/if\(!anchor\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  assert.doesNotMatch(cloud,/if\(remote\.updatedAt>local\.updatedAt\)\{await installCloudVault/);
});

test('cloud conflict choices are exposed only through the guarded account recovery UI',async()=>{
  const [cloud,modal]=await Promise.all([read('src/cloud/firebase.ts'),read('src/components/CloudAccountModal.tsx')]);
  assert.match(cloud,/resolveCloudConflictWithLocal/);
  assert.match(cloud,/resolveCloudConflictWithCloud/);
  assert.match(modal,/cloudState!=='conflict'/);
  assert.match(modal,/Keep This Device Copy/);
  assert.match(modal,/Use Cloud Copy/);
  assert.match(modal,/confirmConflict/);
  assert.doesNotMatch(modal,/Sync Now|مزامنة الآن/);
});

test('cloud writes use revision compare-and-swap and preserve recoverable history',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/commitMetaIfUnchanged/);
  assert.match(cloud,/parentRevision/);
  assert.match(cloud,/deviceId/);
  assert.match(cloud,/archivePreviousRevision/);
  assert.match(cloud,/HISTORY_LIMIT=12/);
  assert.match(cloud,/HISTORY_DAILY_DAYS=30/);
});
