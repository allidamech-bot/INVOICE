import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const path=new URL('../src/storage/db.ts',import.meta.url);
const UID='test-account-uid';
const PARENT='remote-rev-1';
function runStorage(record){
  const src=record;
  const store={current:JSON.parse(JSON.stringify(src))};
  const fakeDb={
    transaction(){
      const tx={};
      const obj={
        get:()=>{
          const request={result:JSON.parse(JSON.stringify(store.current)),onsuccess:null,onerror:null};
          queueMicrotask(()=>{
            request.onsuccess?.();
            queueMicrotask(()=>tx.oncomplete?.());
          });
          return request;
        },
        put:data=>{store.current=JSON.parse(JSON.stringify(data));}
      };
      tx.objectStore=()=>obj;
      return tx;
    }
  };
  return {store,env:{
    exports:{},activeStorageUid:UID,STORE:'kv',openDb:async()=>fakeDb,
    crypto:webcrypto,Date,Promise,Error
  }};
}
async function execute(env){
  const source=await readFile(path,'utf8');
  const a=source.indexOf('export async function updatePlainWorkspaceIfUnchanged(');
  const b=source.indexOf('/** Preserve the displaced workspace',a);
  assert.ok(a>=0&&b>a);
  const emitted=ts.transpileModule(source.slice(a,b),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  vm.runInNewContext(emitted,env);
  return env.exports;
}
function original(){
  return {id:'workspace-v2',uid:UID,schemaVersion:1,
    payload:{schemaVersion:1,customers:[]},
    updatedAt:'2026-10-11T12:00:00.000Z',
    localRevision:'local-1',baseCloudRevision:PARENT,
    baseCloudSha256:'a'.repeat(64)};
}

test('in-flight upload can acknowledge a newer derived local edit safely',async()=>{
  const {store,env}=runStorage(original());
  const api=await execute(env);
  const next=await api.updatePlainWorkspaceIfUnchanged(UID,'local-1',{schemaVersion:1,customers:[{id:'new'}]});
  assert.ok(next?.localAncestors?.includes('local-1'));
  const saved=await api.acknowledgePlainWorkspace(UID,'local-1','remote-rev-2','b'.repeat(64),PARENT);
  assert.equal(saved,true);
  assert.equal(store.current.baseCloudRevision,'remote-rev-2');
  assert.equal(store.current.localRevision,next.localRevision);
  assert.equal(store.current.payload.customers[0].id,'new');
  assert.equal(store.current.localAncestors.length,0);
});
test('two queued descendant edits keep their latest unsynced payload',async()=>{
  const {store,env}=runStorage(original());
  const api=await execute(env);
  const first=await api.updatePlainWorkspaceIfUnchanged(UID,'local-1',{schemaVersion:1,customers:[{id:'one'}]});
  const second=await api.updatePlainWorkspaceIfUnchanged(UID,first.localRevision,{schemaVersion:1,customers:[{id:'two'}]});
  assert.equal(await api.acknowledgePlainWorkspace(UID,'local-1','remote-rev-2','b'.repeat(64),PARENT),true);
  assert.equal(store.current.baseCloudRevision,'remote-rev-2');
  assert.equal(store.current.payload.customers[0].id,'two');
  assert.ok(store.current.localAncestors.includes(first.localRevision));
  assert.ok(!store.current.localAncestors.includes('local-1'));
  assert.equal(store.current.localRevision,second.localRevision);
});
test('a sibling local generation never gets a false cloud acknowledgment',async()=>{
  const {store,env}=runStorage({...original(),localRevision:'sibling-generation',localAncestors:[]});
  const api=await execute(env);
  assert.equal(await api.acknowledgePlainWorkspace(UID,'local-1','remote-rev-2','b'.repeat(64),PARENT),false);
  assert.equal(store.current.baseCloudRevision,PARENT);
});
test('a different cloud base revision never gets rebased across conflict',async()=>{
  const {store,env}=runStorage({...original(),localRevision:'local-2',localAncestors:['local-1'],baseCloudRevision:'other-remote'});
  const api=await execute(env);
  assert.equal(await api.acknowledgePlainWorkspace(UID,'local-1','remote-rev-2','b'.repeat(64),PARENT),false);
  assert.equal(store.current.baseCloudRevision,'other-remote');
});
