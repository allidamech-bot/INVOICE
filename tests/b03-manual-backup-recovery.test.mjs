import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {backupPasswordIssue} from '../dist/src/lib/backup.js';
import {createEncryptedBackup,decryptBackup} from '../dist/src/crypto/crypto.js';
import {emptyVault} from '../dist/src/lib/defaults.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;

test('B03: new exports require a strong independent password, not the unlock PIN',()=>{
  assert.match(backupPasswordIssue('123456789012','1234'),/numeric PIN/);
  assert.match(backupPasswordIssue('abcD123','1234'),/at least 12/);
  assert.match(backupPasswordIssue('aaaaaaaaaaaa1234','1234'),/strong backup passphrase/);
  assert.match(backupPasswordIssue('correct-horse-battery-staple','correct-horse-battery-staple'),/different from the device PIN/);
  assert.equal(backupPasswordIssue('Long backup phrase #582','1234'),'');
});

test('B03: independent backup password roundtrips the complete vault and rejects a wrong secret',async()=>{
  const vault=emptyVault();
  vault.company.nameEn='LOUREX round-trip example';
  const backup=await createEncryptedBackup('Separate strong backup key! 2026',vault);
  assert.equal(backup.format,'LOUREX_BACKUP');
  assert.equal(backup.version,1);
  assert.equal(backup.cipher.name,'AES-GCM');
  assert.ok(!JSON.stringify(backup).includes('LOUREX round-trip example'));
  const restored=await decryptBackup('Separate strong backup key! 2026',backup);
  assert.equal(restored.company.nameEn,'LOUREX round-trip example');
  assert.equal(restored.schemaVersion,vault.schemaVersion);
  await assert.rejects(decryptBackup('Wrong backup password',backup),/password\/PIN is incorrect/);
});

test('B03: older PIN-encrypted v1 backups still decrypt with the original PIN',async()=>{
  const backup=await createEncryptedBackup('1234',emptyVault());
  const restored=await decryptBackup('1234',backup);
  assert.ok(Array.isArray(restored.documents));
});

test('B03: PIN-free Data Center downloads local copy and confirms cloud-affecting import',async()=>{
  const settings=await readFile('src/components/SettingsModal.tsx','utf8');
  assert.match(settings,/private dataCenter\(\)/);
  assert.match(settings,/Save local copy/);
  assert.match(settings,/Review & import/);
  assert.match(settings,/type="file" accept="\.lourex-json,application\/json"/);
  assert.match(settings,/confirmLocalRestore:boolean/);
  assert.match(settings,/private restoreLocalBackup=async/);
  assert.match(settings,/this\.props\.onRestore\(file\)/);
  assert.match(settings,/private exportLocalBackup=async/);
  assert.match(settings,/this\.props\.onBackup\(\)/);
  assert.match(settings,/this\.hasUnsavedSettings\(\)/);
  assert.doesNotMatch(settings,/onChangePin|onCreateRecoveryKey|Current device PIN|Change PIN/);
});

test('B03: optional plain local export and import do not need a PIN and preserve a recovery archive',async()=>{
  const app=await readFile('src/app/App.tsx','utf8');
  const backup=app.slice(app.indexOf('  private backup=async('),app.indexOf('  private restore=async('));
  assert.match(backup,/await this\.drainVaultWrites\(\)/);
  assert.match(backup,/uid!==currentCloudUser\(\)\?\.uid/);
  assert.match(backup,/await exportPlainBackup\(local\.payload\)/);
  assert.doesNotMatch(backup,/verifyPin\(|exportBackup\(password/);
  const restore=app.slice(app.indexOf('  private restore=async('),app.indexOf('  private requireVault('));
  assert.match(restore,/readPlainBackup\(file\)/);
  assert.match(restore,/beginProtectedOperation\(\)/);
  assert.match(restore,/replacePlainWorkspaceIfUnchanged\(uid,current\.localRevision,replacement,'replaced-by-backup'\)/);
  assert.match(restore,/if\(!ok\)throw new Error/);
  assert.match(restore,/scheduleCloudSync\(300\)/);
  const backupModule=await readFile('src/lib/backup.ts','utf8');
  assert.match(backupModule,/LOUREX_WORKSPACE_EXPORT_V2/);
  assert.match(backupModule,/assertRestorableBackupVault\(parsed\.payload\)/);
  assert.match(backupModule,/exportPlainBackup\(vault:VaultPayload\)/);
});

test('B03: backup read enforces size and basic vault shape after authentication, and reports share cancel',async()=>{
  const source=await readFile('src/lib/backup.ts','utf8');
  assert.match(source,/file\.size > 50 \* 1024 \* 1024/);
  assert.match(source,/assertRestorableBackupVault\(restored\)/);
  const {assertRestorableBackupVault}=await import('../dist/src/lib/backup.js');
  const valid=emptyVault();
  assert.doesNotThrow(()=>assertRestorableBackupVault(valid));
  assert.throws(()=>assertRestorableBackupVault({...valid,documents:null}),/documents.*missing or invalid/);
  assert.throws(()=>assertRestorableBackupVault({...valid,customers:undefined}),/customers.*missing or invalid/);
  assert.throws(()=>assertRestorableBackupVault({...valid,schemaVersion:valid.schemaVersion+100}),/unsupported data version/);
  assert.throws(()=>assertRestorableBackupVault({...valid,payments:null}),/payments.*missing or invalid/);
  assert.match(source,/Backup sharing was canceled\. No file has been saved/);
  assert.match(source,/Backup data is incomplete\. The existing workspace was not changed/);
  assert.match(source,/raw\.schemaVersion/);
  assert.match(source,/APP_SCHEMA_VERSION/);
});
