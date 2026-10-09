import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {backupPasswordIssue,assertRestorableBackupVault} from '../dist/src/lib/backup.js';
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

test('B03: Data Center exposes explicit export and file restore with destructive confirmation',async()=>{
  const settings=await readFile('src/components/SettingsModal.tsx','utf8');
  assert.match(settings,/private dataCenter\(\)/);
  assert.match(settings,/Export Encrypted Backup/);
  assert.match(settings,/Review & Restore Backup/);
  assert.match(settings,/type="file" accept="\.lourex-backup,application\/json"/);
  assert.match(settings,/confirmLocalRestore:boolean/);
  assert.match(settings,/private restoreLocalBackup=async/);
  assert.match(settings,/this\.props\.onRestore\(restoreFile,restorePassword\)/);
  assert.match(settings,/private exportEncryptedBackup=async/);
  assert.match(settings,/this\.props\.onBackup\(backupPin,backupPassword\)/);
  assert.match(settings,/Restore Selected Backup/);
  assert.match(settings,/this\.hasUnsavedSettings\(\)/);
  assert.match(settings,/backupPin:'',backupPassword:'',backupPasswordConfirm:''/);
  assert.match(settings,/restorePassword:''/);
});

test('B03: export PIN verification is independent of the backup encryption password',async()=>{
  const app=await readFile('src/app/App.tsx','utf8');
  const source=app.slice(app.indexOf('  private backup=async('),app.indexOf('  private restore=async('));
  assert.match(source,/backupPasswordIssue\(password,pin\)/);
  assert.match(source,/verifyPin\(pin,security\)/);
  assert.match(source,/exportBackup\(password,fullVault\)/);
  assert.doesNotMatch(source,/exportBackup\(pin,fullVault\)/);
  const localRestore=app.slice(app.indexOf('  private restore=async('),app.indexOf('  private requireVault('));
  assert.match(localRestore,/readBackup\(file,pin\)/);
  assert.match(localRestore,/beginProtectedOperation\(\)/);
  assert.match(localRestore,/restoreVaultWithCurrentKey\(key,restored\)/);
  assert.match(localRestore,/if\(committed\)this\.scheduleCloudSync\(500\)/);
  assert.match(localRestore,/committed=true/);
  assert.match(localRestore,/try\{await this\.syncPublicPreferences\(/);
  const vault=await readFile('src/storage/vault.ts','utf8');
  assert.match(vault,/restoreVaultWithCurrentKey[\s\S]*createSafetySnapshot\('pre-restore'\)/);
});

test('B03: backup read enforces size and basic vault shape after authentication, and reports share cancel',async()=>{
  const source=await readFile('src/lib/backup.ts','utf8');
  assert.match(source,/file\.size > 50 \* 1024 \* 1024/);
  // The current implementation validates decrypted records in a dedicated
  // function. Exercise its behavior rather than matching obsolete inline code.
  const valid=emptyVault();
  assert.doesNotThrow(()=>assertRestorableBackupVault(valid));
  assert.throws(()=>assertRestorableBackupVault({...valid,documents:null}),/documents/);
  assert.throws(()=>assertRestorableBackupVault({...valid,customers:{}}),/customers/);
  assert.throws(()=>assertRestorableBackupVault({...valid,documents:[null]}),/documents/);
  assert.throws(()=>assertRestorableBackupVault({...valid,schemaVersion:999999}),/unsupported data version/);
  assert.match(source,/Backup sharing was canceled\. No file has been saved/);
  assert.match(source,/Backup data is incomplete\. The existing workspace was not changed/);

});
