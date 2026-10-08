import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cloudSecurityMatches} from '../dist/src/cloud/firebase.js';
import {APP_SCHEMA_VERSION} from '../dist/src/lib/defaults.js';

const read=path=>readFile(path,'utf8');

test('B03: cloud sync detects changed PIN and recovery wraps even with matching business ciphertext',()=>{
  const metadata={
    id:'security',version:2,iterations:310000,
    salt:'s',verifierIv:'v',verifierCipher:'c',
    pinWrapIv:'p',pinWrapCipher:'k',
    recoveryIterations:310000,recoverySalt:'r',recoveryWrapIv:'i',recoveryWrapCipher:'rc'
  };
  assert.equal(cloudSecurityMatches(metadata,{...metadata}),true);
  for(const field of ['salt','verifierCipher','pinWrapCipher','recoverySalt','recoveryWrapCipher']){
    assert.equal(cloudSecurityMatches(metadata,{...metadata,[field]:`changed-${field}`}),false,field);
  }
  assert.equal(cloudSecurityMatches(metadata,{...metadata,version:1}),false);
});

test('B03: future cloud schemas are blocked for explicit restore, PIN unlock and autosync',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const install=cloud.slice(cloud.indexOf('export async function installCloudVault('),cloud.indexOf('export async function pushLocalVaultToCloud('));
  assert.match(install,/meta\.schemaVersion>APP_SCHEMA_VERSION/);
  assert.ok(install.indexOf('if(meta.schemaVersion>APP_SCHEMA_VERSION)')<install.indexOf('pullCloudVaultFromMeta(uid,meta)'));
  assert.ok(install.lastIndexOf('if(meta.schemaVersion>APP_SCHEMA_VERSION)')<install.indexOf('putSecurityAndVault(remote.security,remote.vault)'));
  const push=cloud.slice(cloud.indexOf('export async function pushLocalVaultToCloud('),cloud.indexOf('// Compatibility exports'));
  assert.match(push,/previous&&previous\.schemaVersion>APP_SCHEMA_VERSION/);
  assert.match(push,/cloudSecurityMatches\(previous\.security,security\)/);
  const publish=cloud.slice(cloud.indexOf('async function publishVault('),cloud.indexOf('async function pullCloudVaultFromMeta('));
  assert.match(publish,/previous&&previous\.schemaVersion>APP_SCHEMA_VERSION/);
  const unlock=cloud.slice(cloud.indexOf('export async function refreshCloudVaultForUnlock('),cloud.indexOf('export async function reconcileCloudVault('));
  assert.match(unlock,/remote\.schemaVersion>APP_SCHEMA_VERSION/);
  const reconcile=cloud.slice(cloud.indexOf('export async function reconcileCloudVault('));
  assert.match(reconcile,/remote&&remote\.schemaVersion>APP_SCHEMA_VERSION/);
  assert.ok(APP_SCHEMA_VERSION>0);
});

test('B03: identical vault cipher with changed security metadata cannot be silently marked synced',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const unlock=cloud.slice(cloud.indexOf('export async function refreshCloudVaultForUnlock('),cloud.indexOf('export async function reconcileCloudVault('));
  const reconcile=cloud.slice(cloud.indexOf('export async function reconcileCloudVault('));
  for(const part of [unlock,reconcile]){
    assert.match(part,/const localSecurity=await getSecurity\(\)/);
    assert.match(part,/!cloudSecurityMatches\(localSecurity,remote\.security\)\)return 'diverged'/);
  }
});

test('B03: cloud safety retains transactional optimistic concurrency and account ownership checks',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/requireCurrentUid\(uid\)/);
  assert.match(cloud,/transaction\.get\(ref\)/);
  assert.match(cloud,/transaction\.set\(ref,meta\)/);
  assert.match(cloud,/if\(inlineDraftWorkspaceOpen\(\)\)throw new Error/);
});
