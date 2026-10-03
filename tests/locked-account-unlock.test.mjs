import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const cloud=readFileSync(new URL('../src/cloud/firebase.ts',import.meta.url),'utf8');
const refresh=cloud.slice(cloud.indexOf('export async function refreshCloudVaultForUnlock'),cloud.indexOf('export async function reconcileCloudVault'));
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

function fixture({local='baseline',remote='new-pin',anchor={cipherSha256:'baseline',revision:'old'},locked=true,uid='account-a'}={}){
  const installs=[],anchors=[];
  const context={exports:{},getEncryptedVault:async()=>local?{cipher:local}:null,getCloudVaultMeta:async()=>remote?{cipherSha256:remote,revision:'new'}:null,
    requireCurrentUid:value=>{assert.equal(value,uid);},sha256:async value=>value,readSyncAnchor:()=>anchor,writeSyncAnchor:(...value)=>anchors.push(value),
    document:{querySelector:()=>locked?{}:null},installCloudVault:async value=>{installs.push(value);return true;}};
  vm.runInNewContext(compile(refresh),context);
  return {run:()=>context.exports.refreshCloudVaultForUnlock('account-a'),installs,anchors};
}

test('locked second device fetches new PIN metadata when its local copy is unchanged',async()=>{
  const f=fixture();assert.equal(await f.run(),'pulled');assert.deepEqual(f.installs,['account-a']);
});
test('unknown or locally changed copies need explicit conflict choice',async()=>{
  for(const options of [{anchor:null},{local:'unsynced-work'}]){
    const f=fixture(options);assert.equal(await f.run(),'diverged');assert.deepEqual(f.installs,[]);
  }
});
test('same cloud copy, local-only changes, and absent cloud copy never trigger replacement',async()=>{
  for(const options of [{local:'new-pin'},{anchor:{cipherSha256:'baseline',revision:'new'},local:'unsynced-work',remote:'baseline'},{remote:null}]){
    const f=fixture(options);assert.equal(await f.run(),'same');assert.deepEqual(f.installs,[]);
  }
});
test('refresh cannot replace an open workspace or read a different signed-in account',async()=>{
  for(const options of [{locked:false},{uid:'account-b'}]){
    const f=fixture(options);await assert.rejects(f.run());assert.deepEqual(f.installs,[]);
  }
});
test('fresh device restores encrypted account data before verification',async()=>{
  const f=fixture({local:null});assert.equal(await f.run(),'pulled');assert.deepEqual(f.installs,['account-a']);
});
test('Arabic and Persian keyboards preserve the same PIN digits and leading zeroes',()=>{
  const context={exports:{}};vm.runInNewContext(compile(readFileSync(new URL('../src/lib/account-security.ts',import.meta.url),'utf8')),context);
  const normalize=context.exports.normalizePinInput;
  for(const value of ['012345','٠١٢٣٤٥','۰۱۲۳۴۵','0١۲3٤۵'])assert.equal(normalize(value),'012345');
  assert.equal(normalize('٠١٢٣٤٥٦٧٨٩٠١٢٣'),'012345678901');
});
