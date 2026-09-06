import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('app hydrates authoritative cloud vault before rendering local unlock state',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.match(entry,/hydrateAuthoritativeCloudBeforeApp/);
  assert.match(entry,/await hydrateAuthoritativeCloudBeforeApp\(\)/);
  assert.ok(entry.indexOf('await hydrateAuthoritativeCloudBeforeApp()')<entry.indexOf('ReactDOM.render'));
});

test('startup cloud bootstrap links authenticated account and uses guarded reconcile',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/waitForCloudUser/);
  assert.match(startup,/getCloudVaultMeta/);
  assert.match(startup,/putCloudAccount\(user\.uid,user\.email\)/);
  assert.match(startup,/reconcileCloudVault\(user\.uid\)/);
  assert.doesNotMatch(startup,/installCloudVault\(user\.uid,false\)/);
});
