import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v339 blocks a late startup cloud pull from replacing IndexedDB after React is released',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/const STARTUP_CLOUD_BUDGET_MS=450/);
  assert.match(startup,/const STARTUP_CLOUD_GUARD='startup-cloud-budget'/);
  assert.match(startup,/if\(!root\.hasAttribute\('data-lourex-workspace-dirty'\)\)root\.setAttribute\('data-lourex-workspace-dirty',STARTUP_CLOUD_GUARD\)/);
  assert.match(startup,/if\(root\.getAttribute\('data-lourex-workspace-dirty'\)===STARTUP_CLOUD_GUARD\)root\.removeAttribute\('data-lourex-workspace-dirty'\)/);
  const timeoutFlow=startup.slice(startup.indexOf("if(outcome.kind==='done')return;"));
  const mark=timeoutFlow.indexOf('markLateStartupCloudApplyUnsafe();');
  const settle=timeoutFlow.indexOf('cloudWork.then(signalDeferredCloudPull)');
  const clear=timeoutFlow.indexOf('.finally(clearLateStartupCloudApplyGuard)');
  assert.ok(mark>=0&&settle>mark&&clear>settle,'timeout must arm the commit-boundary guard before the in-flight cloud request can settle');
});

test('cloud installation rechecks the shared dirty guard immediately before local vault replacement',async()=>{
  const firebase=await read('src/cloud/firebase.ts');
  const install=firebase.slice(firebase.indexOf('export async function installCloudVault'),firebase.indexOf('export async function pushLocalVaultToCloud'));
  const secondSafetyCheck=install.lastIndexOf('if(inlineDraftWorkspaceOpen())');
  const commit=install.indexOf('await putSecurityAndVault(remote.security,remote.vault)');
  assert.ok(secondSafetyCheck>=0&&commit>secondSafetyCheck,'install must revalidate workspace safety after network reads and before IndexedDB commit');
  assert.match(firebase,/hasAttribute\('data-lourex-workspace-dirty'\)/);
});