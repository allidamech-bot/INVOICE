import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('cloud identity is authorized only when Firebase UID and active IndexedDB UID both match',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const start=cloud.indexOf('function requireCurrentUid(');
  const end=cloud.indexOf('function markRecentAuth(',start);
  assert.ok(start>=0&&end>start);
  const compiled=ts.transpileModule(cloud.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let firebaseUid='company-A',localUid='company-A';
  const context={auth:()=>({currentUser:firebaseUid?{uid:firebaseUid}:null}),activeAccountStorageUid:()=>localUid};
  vm.runInNewContext(compiled,context);
  assert.doesNotThrow(()=>context.requireCurrentUid('company-A'));
  for(const [firebase,local] of [['company-A','company-B'],['company-B','company-A'],['company-A',null],[null,'company-A']]){
    firebaseUid=firebase;
    localUid=local;
    assert.throws(()=>context.requireCurrentUid('company-A'),/Cloud session is not available/);
  }
});

test('cloud publishing refuses asynchronous auth/storage changes before using the vault snapshot',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const start=cloud.indexOf('export async function pushLocalVaultToCloud(');
  const end=cloud.indexOf('// Compatibility exports',start);
  assert.ok(start>=0&&end>start);
  const compiled=ts.transpileModule(cloud.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let uid='company-A',uploads=0,reads=0;
  const context={exports:{},navigator:{onLine:true},
    requireCurrentUid:requested=>{if(uid!==requested)throw new Error('Storage/identity changed');},
    getSecurity:async()=>({}),
    getEncryptedVault:async()=>{reads++;uid='company-B';return {cipher:'company-A-encrypted-vault'};},
    getCloudVaultMeta:async()=>null,
    sha256:async()=> 'd'.repeat(64),
    publishVault:async()=>{uploads++;throw new Error('Unsafe cloud publish invoked');}
  };
  vm.runInNewContext(compiled,context);
  await assert.rejects(context.exports.pushLocalVaultToCloud('company-A'),/Storage\/identity changed/);
  assert.equal(reads,1);
  assert.equal(uploads,0,'a vault read that overlapped account switching must never publish encrypted data');
});

test('all remote vault commits retain identity checks after asynchronous reads',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const install=cloud.slice(cloud.indexOf('export async function installCloudVault('),cloud.indexOf('export async function pushLocalVaultToCloud('));
  assert.match(install,/const remote=await pullCloudVaultFromMeta\(uid,meta\);[\s\S]*requireCurrentUid\(uid\);[\s\S]*await putSecurityAndVault\(remote.security,remote.vault\)/);
  const publish=cloud.slice(cloud.indexOf('async function publishVault('),cloud.indexOf('async function pullCloudVaultFromMeta('));
  assert.match(publish,/const cipherSha256=await sha256\(vault.cipher\);[\s\S]*requireCurrentUid\(uid\);/);
  assert.match(publish,/await writeChunks\(uid,revision,chunks\);requireCurrentUid\(uid\);await commitMetaIfUnchanged\(uid,meta,previous\)/);
});
