import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const cloud=readFileSync(new URL('../src/cloud/firebase.ts',import.meta.url),'utf8');
const defaults=readFileSync(new URL('../src/lib/defaults.ts',import.meta.url),'utf8');
const APP_SCHEMA_VERSION=Number(defaults.match(/export const APP_SCHEMA_VERSION = (\d+);/)?.[1]);
assert.ok(Number.isInteger(APP_SCHEMA_VERSION)&&APP_SCHEMA_VERSION>0,'The tested cloud schema version must match production source.');
const refresh=cloud.slice(cloud.indexOf('export async function refreshCloudVaultForUnlock'),cloud.indexOf('export async function reconcileCloudVault'));
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

function fixture({local='baseline',remote='new-pin',anchor={cipherSha256:'baseline',revision:'old'},locked=true,uid='account-a',remoteSchemaVersion=APP_SCHEMA_VERSION,localSecurity={pin:'test'},remoteSecurity={pin:'test'}}={}){
  const installs=[],anchors=[];
  const context={exports:{},APP_SCHEMA_VERSION,
    getEncryptedVault:async()=>local?{cipher:local}:null,
    getSecurity:async()=>localSecurity,
    cloudSecurityMatches:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    getCloudVaultMeta:async()=>remote?{cipherSha256:remote,revision:'new',schemaVersion:remoteSchemaVersion,security:remoteSecurity}:null,
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
test('unlock rejects a vault requiring a newer application schema',async()=>{
  const f=fixture({remoteSchemaVersion:APP_SCHEMA_VERSION+1});
  await assert.rejects(f.run(),/requires a newer LOUREX version/);
  assert.deepEqual(f.installs,[]);
});

test('unlock treats a changed cloud PIN security envelope as a conflict',async()=>{
  const f=fixture({local:'new-pin',remote:'new-pin',remoteSecurity:{pin:'other'}});
  assert.equal(await f.run(),'diverged');
  assert.deepEqual(f.installs,[]);
});

test('Arabic and Persian keyboards preserve the same PIN digits and leading zeroes',()=>{
  const context={exports:{}};vm.runInNewContext(compile(readFileSync(new URL('../src/lib/account-security.ts',import.meta.url),'utf8')),context);
  const normalize=context.exports.normalizePinInput;
  for(const value of ['012345','٠١٢٣٤٥','۰۱۲۳۴۵','0١۲3٤۵'])assert.equal(normalize(value),'012345');
  assert.equal(normalize('٠١٢٣٤٥٦٧٨٩٠١٢٣'),'012345678901');
});
