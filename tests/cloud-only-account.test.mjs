import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('local recovery UI is completely retired',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.doesNotMatch(entry,/local-recovery|startLocalRecoveryAssistant|Recover local data/i);
  const db=await read('src/storage/db.ts');
  assert.match(db,/purgeLegacySafetySnapshot/);
  assert.match(db,/createSafetySnapshot[\s\S]*purgeLegacySafetySnapshot\(\)[\s\S]*return null/);
});

test('manual backup, sync, and lock controls are not exposed',async()=>{
  const [settings,cloudCss]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/styles/cloud.css')]);
  assert.doesNotMatch(settings,/Backup \/ Restore|Backup Data|Choose backup file|backupPin|restoreFile/);
  assert.match(settings,/Restore from Cloud/);
  assert.match(cloudCss,/\.auth-cloud-launcher,\.cloud-header-button,\.header-lock-button\{display:none!important\}/);
});

test('cloud restore uses the signed-in account without a backup PIN prompt',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  assert.match(settings,/currentCloudUser\(\)/);
  assert.match(settings,/installCloudVault\(user\.uid,false\)/);
  assert.doesNotMatch(settings,/Backup PIN|restorePin/);
});

test('cloud account is authoritative and cloud pulls do not create local recovery snapshots',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.doesNotMatch(cloud,/createSafetySnapshot/);
  assert.match(cloud,/if\(!anchor\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  assert.match(cloud,/if\(remoteChanged\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  assert.match(cloud,/if\(remoteChanged\)\{const installed=await installCloudVault\(uid,true\)/);
});

test('background account refresh is silent and automatic',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/subscribeCloudVaultChanges/);
  assert.match(freshness,/15_000/);
  assert.doesNotMatch(freshness,/lourex-cloud-remote-newer/);
});
