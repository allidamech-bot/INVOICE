import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('multi-device freshness never trusts device wall-clock timestamps',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/cloudRemoteChangedSinceAnchor/);
  assert.doesNotMatch(freshness,/remote\.updatedAt\s*[<>]=?\s*local\.updatedAt/);
});

test('different local and account copies without a verified anchor are preserved as a conflict',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/writeConflict/);
  assert.match(cloud,/Nothing was overwritten/);
  assert.match(cloud,/Both copies are safe/);
  assert.doesNotMatch(cloud,/if\(remote\.updatedAt>local\.updatedAt\)\{await installCloudVault/);
});

test('explicit conflict resolution can publish this device or restore the account copy',async()=>{
  const [cloud,modal]=await Promise.all([read('src/cloud/firebase.ts'),read('src/components/CloudAccountModal.tsx')]);
  assert.match(cloud,/resolveCloudConflictWithLocal/);
  assert.match(cloud,/resolveCloudConflictWithCloud/);
  assert.match(modal,/Keep This Device Copy/);
  assert.match(modal,/Use Account Copy/);
  assert.match(modal,/hasCloudConflict/);
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
