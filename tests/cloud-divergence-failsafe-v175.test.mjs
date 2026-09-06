import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(path,'utf8');

test('cloud reconcile never auto-pulls over an existing divergent local vault without a trustworthy anchor',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.doesNotMatch(cloud,/if\(!anchor\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  assert.match(cloud,/if\(!anchor\)return 'diverged'/);
  assert.match(cloud,/if\(localChanged&&remoteChanged\)return 'diverged'/);
});

test('startup uses guarded reconcile instead of installing remote data directly',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/reconcileCloudVault\(user\.uid\)/);
  assert.doesNotMatch(startup,/installCloudVault\(user\.uid,false\)/);
});

test('automatic cloud freshness does not reload or overwrite on divergence',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/result==='diverged'/);
});
