import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {assertRestorableBackupVault,readBackup} from '../dist/src/lib/backup.js';
import {createEncryptedBackup} from '../dist/src/crypto/crypto.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const clone=value=>structuredClone(value);
const fakeFile=value=>({size:JSON.stringify(value).length,text:async()=>JSON.stringify(value)});

test('B03: a complete current-schema vault remains restorable',()=>{
  const vault=emptyVault();
  assert.doesNotThrow(()=>assertRestorableBackupVault(vault));
});

test('B03: missing modern financial collections fail closed rather than being silently defaulted',()=>{
  for(const field of ['payments','purchases','supplierPayments','inventoryMovements','treasuryEntries','documents','savedItems','workspaces','branches']){
    const incomplete=clone(emptyVault());
    delete incomplete[field];
    assert.throws(()=>assertRestorableBackupVault(incomplete),new RegExp(field));
  }
});

test('B03: invalid records or non-array collections fail validation',()=>{
  const original=emptyVault();
  const badRows=clone(original);
  badRows.purchases=[null];
  assert.throws(()=>assertRestorableBackupVault(badRows),/purchases/);
  const badType=clone(original);
  badType.payments={id:'payment-1'};
  assert.throws(()=>assertRestorableBackupVault(badType),/payments/);
  assert.throws(()=>assertRestorableBackupVault({schemaVersion:21,customers:[],documents:[]}),/incomplete/);
});

test('B03: old backups may omit collections introduced after their schema version',()=>{
  const old=clone(emptyVault());
  old.schemaVersion=7;
  for(const key of ['treasuryAccounts','treasuryEntries','treasuryReconciliations','warehouses','workspaces','branches','supplierPayments','approvalRequests','recurringWorkflows'])delete old[key];
  assert.doesNotThrow(()=>assertRestorableBackupVault(old));
});

test('B03: actual encrypted backup rejects missing current-era collections before replacement',async()=>{
  const vault=clone(emptyVault());
  delete vault.payments;
  const passphrase='A separate strong backup passphrase #2026';
  const encrypted=await createEncryptedBackup(passphrase,vault);
  await assert.rejects(readBackup(fakeFile(encrypted),passphrase),/payments/);
  const goodEncrypted=await createEncryptedBackup(passphrase,emptyVault());
  const actual=await readBackup(fakeFile(goodEncrypted),passphrase);
  assert.ok(Array.isArray(actual.payments));
});

test('B03: a backup from a newer schema fails before any replacement attempt',()=>{
  const future=clone(emptyVault());
  future.schemaVersion=999;
  assert.throws(()=>assertRestorableBackupVault(future),/unsupported data version/);
});
