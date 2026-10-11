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

test('manual local copy requires explicit user action and destructive import confirmation without PIN',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  const backup=await read('src/lib/backup.ts');
  assert.match(settings,/private dataCenter\(\)/);
  assert.match(settings,/private exportLocalBackup=async/);
  assert.match(settings,/this\.props\.onBackup\(\)/);
  assert.match(settings,/this\.hasUnsavedSettings\(\)/);
  assert.match(settings,/private requestLocalRestore=/);
  assert.match(settings,/confirmLocalRestore:true/);
  assert.match(settings,/if\(this\.state\.busy\|\|!this\.state\.confirmLocalRestore\)return/);
  assert.match(settings,/this\.props\.onRestore\(file\)/);
  assert.match(settings,/Restore cloud copy/);
  assert.match(settings,/await this\.props\.onCloudRestore\(\)/);
  assert.doesNotMatch(settings,/private lockNow=|onLock:\(\)=>|backupPasswordIssue|onChangePin/);
  assert.match(backup,/LOUREX_WORKSPACE_EXPORT_V2/);
});

test('manual cloud restore uses the signed-in UID, validates remote integrity and archives prior local copy',async()=>{
  const [settings,app,cloud]=await Promise.all([
    read('src/components/SettingsModal.tsx'),read('src/app/App.tsx'),read('src/cloud/plain-workspace.ts')
  ]);
  assert.match(settings,/await this\.props\.onCloudRestore\(\)/);
  const restore=app.slice(app.indexOf('  private cloudRestore=async'),app.indexOf('  private keepLocalCloudCopy=async'));
  assert.match(restore,/await this\.beginProtectedOperation\(\)/);
  assert.match(restore,/downloadPlainCloudWorkspace\(uid\)/);
  assert.match(restore,/replacePlainWorkspaceIfUnchanged\(uid,current\?\.localRevision\?\?null,replacement,'replaced-by-cloud'\)/);
  assert.match(restore,/this\.endProtectedOperation\(\)/);
  assert.match(cloud,/assertRestorableBackupVault\(payload\)/);
  assert.doesNotMatch(restore,/verifyPin\(|unlockVault\(/);
});

test('automatic cloud reconciliation is startup-gated and fails closed after the workspace mounts',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.doesNotMatch(cloud,/createSafetySnapshot/);
  assert.match(cloud,/const startup=Boolean\(document\.querySelector\('\.loading-screen'\)\)&&!document\.querySelector\('\.app-ui,\.auth-page'\)/);
  assert.match(cloud,/if\(!anchor\)return 'diverged'/);
  assert.match(cloud,/if\(localChanged&&remoteChanged\)return 'diverged'/);
  assert.match(cloud,/if\(!local&&remote\)\{\s*if\(!startup\)return 'diverged';\s*await installCloudVault\(uid\);return 'pulled';\s*\}/);
  assert.match(cloud,/if\(remoteChanged\)\{\s*if\(!startup\)return 'diverged';\s*await installCloudVault\(uid\);return 'pulled';\s*\}/);
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