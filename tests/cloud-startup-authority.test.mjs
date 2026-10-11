import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('V2 opens through Firebase Auth and hydrates the authoritative cloud workspace without any PIN prompt',async()=>{
  const [entry,app]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx')]);
  assert.match(entry,/const accountReady=await resolveRequiredAccountSession\(\)/);
  assert.match(entry,/ReactDOM\.render\(<AppErrorBoundary><App\/><\/AppErrorBoundary>/);
  assert.doesNotMatch(entry,/hydrateAuthoritativeCloudBeforeApp\(/);
  const initialize=app.slice(app.indexOf('private initialize=async'),app.indexOf('private activity='));
  assert.match(initialize,/const user=await waitForCloudUser\(\)/);
  assert.match(initialize,/reconcilePlainCloudWorkspace\(user\.uid\)/);
  assert.match(initialize,/await getPlainWorkspace\(\)/);
  assert.match(initialize,/unlocked:true,vault/);
  assert.doesNotMatch(initialize,/unlockVault\(|verifyPin\(|setupVault\(/);
});

test('startup cloud bootstrap links authenticated account and uses guarded reconcile',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/waitForCloudUser/);
  assert.match(startup,/getCloudVaultMeta/);
  assert.match(startup,/putCloudAccount\(user\.uid,user\.email\)/);
  assert.match(startup,/reconcileCloudVault\(user\.uid\)/);
  assert.doesNotMatch(startup,/installCloudVault\(user\.uid,false\)/);
});
