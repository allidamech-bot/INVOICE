import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(path,'utf8');

test('cloud reconcile never auto-pulls over an existing divergent local vault without a trustworthy anchor',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.doesNotMatch(cloud,/if\(!anchor\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  assert.match(cloud,/if\(!anchor\)throw new Error\('Cloud and local data differ/);
  assert.match(cloud,/if\(localChanged&&remoteChanged\)throw new Error\('Cloud and local data both changed/);
});

test('startup uses guarded reconcile instead of installing remote data directly',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/reconcileCloudVault\(user\.uid\)/);
  assert.doesNotMatch(startup,/installCloudVault\(user\.uid,false\)/);
  assert.doesNotMatch(startup,/cloudRemoteChangedSinceAnchor/);
});

test('automatic cloud freshness treats protected divergence as a safety stop instead of retrying it',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/Automatic replacement was blocked to protect your data\./);
  assert.match(freshness,/if\(message\.includes\('Automatic replacement was blocked to protect your data\.'\)\)return;/);
});

test('explicit cloud restore remains available while automatic divergence is blocked',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/resolveCloudConflictWithCloud[\s\S]*installCloudVault\(uid,true\)/);
  assert.match(cloud,/export async function installCloudVault/);
});
