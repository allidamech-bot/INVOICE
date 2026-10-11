import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('Firebase-only entry and PIN-free settings are the active runtime',async()=>{
  const [app,index,settings]=await Promise.all([
    read('src/app/App.tsx'),read('src/app/index.tsx'),read('src/components/SettingsModal.tsx')
  ]);
  assert.doesNotMatch(app,/<AuthScreenSelector|unlockVault\(|setupVault\(|saveVault\(/);
  assert.match(app,/reconcilePlainCloudWorkspace\(user\.uid\)/);
  assert.match(app,/updatePlainWorkspaceIfUnchanged\(uid,local\.localRevision,next\)/);
  assert.doesNotMatch(index,/hydrateAuthoritativeCloudBeforeApp\(/);
  assert.match(index,/subscribePlainCloudChanges\(/);
  assert.doesNotMatch(settings,/Device PIN|Change PIN|Auto Lock|onChangePin|onLock:/);
  assert.match(settings,/Save local copy/);
});

test('V2 sync is versioned, CAS-protected, and never deletes committed chunks',async()=>{
  const [cloud,db]=await Promise.all([
    read('src/cloud/plain-workspace.ts'),read('src/storage/db.ts')
  ]);
  assert.match(cloud,/LOUREX_PLAIN_WORKSPACE_V2/);
  assert.match(cloud,/runTransaction\(async/);
  assert.match(cloud,/replacePlainWorkspaceIfUnchanged\(uid,local\.localRevision,replacement/);
  assert.doesNotMatch(cloud,/deleteUncommittedChunks\(/);
  assert.match(db,/export async function updatePlainWorkspaceIfUnchanged/);
  assert.match(db,/export async function replacePlainWorkspaceIfUnchanged/);
});

test('User-triggered backup remains optional and PIN-free',async()=>{
  const [backup,settings,app]=await Promise.all([
    read('src/lib/backup.ts'),read('src/components/SettingsModal.tsx'),read('src/app/App.tsx')
  ]);
  assert.match(backup,/export async function exportPlainBackup\(/);
  assert.match(backup,/LOUREX_WORKSPACE_EXPORT_V2/);
  assert.match(settings,/onBackup:\(\)=>Promise<void>/);
  assert.match(app,/await exportPlainBackup\(local.payload\)/);
});

test('simultaneous first login from two devices hydrates the winning cloud snapshot instead of demanding a PIN or reload',async()=>{
  const app=await read('src/app/App.tsx');
  const from=app.indexOf('const outcome=await uploadPlainCloudWorkspace(user.uid,proposal)');
  const to=app.indexOf("syncState='synced';",from);
  assert.ok(from>=0&&to>from,'bootstrap publish and winner reconciliation are required');
  const block=app.slice(from,to);
  assert.match(block,/if\(outcome==='remote-changed'\)/);
  assert.match(block,/await reconcilePlainCloudWorkspace\(user\.uid\)/);
  assert.match(block,/winner!=='pulled'&&winner!=='same'/);
  assert.match(block,/replacePlainWorkspaceIfUnchanged\(user\.uid,null/);
  assert.doesNotMatch(block,/unlockVault\(|setupVault\(|window\.location\.reload/);
});
