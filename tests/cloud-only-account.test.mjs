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
  const [settings,cloudCss,i18n]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/styles/cloud.css'),read('src/lib/i18n.ts')]);
  assert.doesNotMatch(settings,/Backup \/ Restore|Backup Data|Choose backup file|backupPin|restoreFile/);
  assert.match(settings,/Restore from Cloud/);
  assert.match(cloudCss,/\.auth-cloud-launcher,\.cloud-header-button,\.header-lock-button,\.settings-panel \.settings-section:has\(select option\[value="30"\]\)>\.btn\{display:none!important\}/);
  assert.match(i18n,/automatic synchronization/);
  assert.match(i18n,/وسيطبقها LOUREX تلقائيًا/);
});

test('cloud restore uses the signed-in account without a backup PIN prompt',async()=>{
  const [settings,app]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/app/App.tsx')]);
  assert.match(settings,/const user=this\.props\.cloudUser/);
  assert.match(settings,/await this\.props\.onCloudRestore\(\)/);
  assert.match(app,/installCloudVault\(user\.uid,false\)/);
  assert.match(app,/await this\.beginProtectedOperation\(\)/);
  assert.doesNotMatch(settings,/Backup PIN|restorePin/);
});

test('automatic cloud reconciliation fails closed on ambiguous divergence and safe pulls do not create local recovery snapshots',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.doesNotMatch(cloud,/createSafetySnapshot/);
  assert.match(cloud,/if\(!anchor\)return 'diverged'/);
  assert.match(cloud,/if\(localChanged&&remoteChanged\)return 'diverged'/);
  assert.match(cloud,/if\(remoteChanged\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  assert.doesNotMatch(cloud,/if\(!anchor\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  const push=cloud.slice(cloud.indexOf('export async function pushLocalVaultToCloud'),cloud.indexOf('// Compatibility exports'));
  assert.match(push,/if\(!anchor\)return 'remote-changed'/);
  assert.match(push,/if\(remoteChanged\)return 'remote-changed'/);
  assert.doesNotMatch(push,/installCloudVault/);
});

test('background account refresh is silent and automatic',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/subscribeCloudVaultChanges/);
  assert.match(freshness,/5_000/);
  assert.doesNotMatch(freshness,/lourex-cloud-remote-newer/);
});
