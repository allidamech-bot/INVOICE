import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
function compileFunction(source,start,end=''){
  const from=source.indexOf(start);
  assert.ok(from>=0,'source function must exist');
  const to=end?source.indexOf(end,from):-1;
  const fragment=source.slice(from,to>=0?to:undefined);
  return ts.transpileModule(fragment,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
}

test('fresh logged-in device always escapes a blocked cloud request instead of hanging boot',async()=>{
  const source=await read('src/cloud/startup.ts');
  assert.match(source,/const FRESH_DEVICE_CLOUD_BUDGET_MS=6_000/);
  let budget=0,unsafe=0;
  const exports={};
  const context={
    exports,Promise,Boolean,navigator:{onLine:true},
    STARTUP_CLOUD_BUDGET_MS:450,FRESH_DEVICE_CLOUD_BUDGET_MS:6000,
    getEncryptedVault:async()=>null,
    runAuthoritativeCloudStartup:()=>new Promise(()=>{}),
    markLateStartupCloudApplyUnsafe:()=>{unsafe++;},
    signalDeferredCloudPull:()=>{},
    clearLateStartupCloudApplyGuard:()=>{},
    window:{
      setTimeout(fn,ms){budget=ms;queueMicrotask(fn);return 1;},
      clearTimeout(){}
    }
  };
  runInNewContext(compileFunction(source,'export async function hydrateAuthoritativeCloudBeforeApp()'),context);
  await exports.hydrateAuthoritativeCloudBeforeApp();
  assert.equal(budget,6000,'fresh device must have its own finite recovery budget');
  assert.equal(unsafe,1,'late cloud writes are blocked after React gets control');
});

test('an already-encrypted local device retains its short nonblocking startup budget',async()=>{
  const source=await read('src/cloud/startup.ts');
  let budget=0,unsafe=0;
  const exports={};
  runInNewContext(compileFunction(source,'export async function hydrateAuthoritativeCloudBeforeApp()'),{
    exports,Promise,navigator:{onLine:true},STARTUP_CLOUD_BUDGET_MS:450,FRESH_DEVICE_CLOUD_BUDGET_MS:6000,
    getEncryptedVault:async()=>({cipher:'existing-encrypted-data'}),
    runAuthoritativeCloudStartup:()=>new Promise(()=>{}),
    markLateStartupCloudApplyUnsafe:()=>{unsafe++;},
    signalDeferredCloudPull:()=>{},clearLateStartupCloudApplyGuard:()=>{},
    window:{setTimeout(fn,ms){budget=ms;queueMicrotask(fn);return 1;},clearTimeout(){}}
  });
  await exports.hydrateAuthoritativeCloudBeforeApp();
  assert.equal(budget,450);
  assert.equal(unsafe,1);
});

test('cancelled cloud restore cannot replace encrypted data after network completion',async()=>{
  const source=await read('src/cloud/firebase.ts');
  const compiled=compileFunction(source,'export async function installCloudVault','export async function pushLocalVaultToCloud');
  const controller=new AbortController();
  let writes=0;
  const exports={};
  runInNewContext(compiled,{
    exports,DOMException,
    requireCurrentUid(uid){assert.equal(uid,'account-a');},
    inlineDraftWorkspaceOpen:()=>false,
    getCloudVaultMeta:async()=>({schemaVersion:1}),
    APP_SCHEMA_VERSION:99,
    pullCloudVaultFromMeta:async()=>{
      controller.abort();
      return {security:{},vault:{}};
    },
    putSecurityAndVault:async()=>{writes++;},
    writeSyncAnchor:()=>{},notifyCloudApplied:()=>{}
  });
  await assert.rejects(()=>exports.installCloudVault('account-a',false,controller.signal),/Cloud restoration cancelled/);
  assert.equal(writes,0,'no IndexedDB replacement after a cancellation');
});

test('authenticated setup never flashes Create PIN while cloud recovery is unknown',async()=>{
  const [selector,startup]=await Promise.all([read('src/app/AuthScreenSelector.tsx'),read('src/cloud/startup.ts')]);
  assert.match(selector,/useState<RecoveryState>\(cloudUser&&props\.mode==='setup'\?'checking':'idle'\)/);
  assert.match(selector,/ACCOUNT_RECOVERY_BUDGET_MS=12_000/);
  assert.match(selector,/controller\.abort\(\)/);
  assert.match(selector,/installCloudVault\(cloudUser\.uid,false,controller\.signal\)/);
  assert.match(selector,/if\(recoveryState==='error'\)return <RecoveryCard state="error"/);
  assert.match(startup,/markLateStartupCloudApplyUnsafe\(\)/);
});
