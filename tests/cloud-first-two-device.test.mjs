import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const SOURCE=new URL('../src/cloud/plain-workspace.ts',import.meta.url);
function fakeFirebase(){
  const docs=new Map();
  const doc=path=>({path,
    get:async()=>({exists:docs.has(path),data:()=>docs.get(path)}),
    collection:name=>collection(path+'/'+name)
  });
  const collection=path=>({doc:name=>doc(path+'/'+name)});
  const firestore=()=>({
    collection,
    batch(){const pending=[];return{
      set:(ref,data)=>pending.push([ref.path,data]),
      commit:async()=>{for(const [path,data] of pending)docs.set(path,structuredClone(data));}
    };},
    runTransaction:async fn=>{
      let update;
      const value=await fn({
        get:ref=>ref.get(),
        set:(ref,data)=>{update=[ref.path,data];}
      });
      if(update)docs.set(update[0],structuredClone(update[1]));
      return value;
    }
  });
  return {firestore,docs};
}
async function client(firebase,uid){
  const code=ts.transpileModule(await readFile(SOURCE,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  const state={local:null,archives:[]};
  const db={
    activeAccountStorageUid:()=>uid,
    getPlainWorkspace:async()=>state.local,
    acknowledgePlainWorkspace:async(_uid,localRevision,revision,sha)=>{
      if(state.local?.localRevision!==localRevision)return false;
      state.local={...state.local,baseCloudRevision:revision,baseCloudSha256:sha};return true;
    },
    replacePlainWorkspaceIfUnchanged:async(_uid,expected,replacement,reason)=>{
      if((state.local?.localRevision??null)!==expected)return false;
      if(state.local&&reason)state.archives.push(state.local);
      state.local=replacement;return true;
    }
  };
  const modules={
    '../lib/defaults.js':{APP_SCHEMA_VERSION:100},
    '../storage/db.js':db,
    './firebase.js':{currentCloudUser:()=>({uid})},
    '../lib/backup.js':{assertRestorableBackupVault:v=>{
      assert.ok(v&&v.company&&v.appSettings&&Array.isArray(v.documents)&&Array.isArray(v.customers));
    }}
  };
  const ctx={exports:{},require:name=>{
    if(!modules[name])throw Error('Unexpected import '+name);
    return modules[name];
  },firebase,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Date,Promise,
    btoa,atob,navigator:{onLine:true},structuredClone};
  vm.runInNewContext(code,ctx);
  return {api:ctx.exports,state};
}
const payload=()=>({schemaVersion:1,company:{nameEn:'Demo'},appSettings:{},
  customers:[],documents:[]});
const local=(data)=>({id:'workspace-v2',uid:'user-1',payload:data,schemaVersion:1,
  localRevision:webcrypto.randomUUID(),updatedAt:new Date().toISOString(),
  baseCloudRevision:null,baseCloudSha256:null});

test('two independent devices hydrate exactly the same Firebase account snapshot',async()=>{
  const firebase=fakeFirebase();
  const a=await client(firebase,'user-1'),b=await client(firebase,'user-1');
  const original=payload();original.documents.push({id:'invoice-1',total:49});
  a.state.local=local(original);
  assert.equal(await a.api.reconcilePlainCloudWorkspace('user-1'),'pushed');
  assert.equal(await b.api.reconcilePlainCloudWorkspace('user-1'),'pulled');
  assert.deepEqual(JSON.parse(JSON.stringify(b.state.local.payload)),original);
  assert.ok(b.state.local.baseCloudRevision,'second device retains authoritative revision');
});
test('concurrent edits never silently overwrite another device',async()=>{
  const firebase=fakeFirebase();
  const a=await client(firebase,'user-1'),b=await client(firebase,'user-1');
  a.state.local=local(payload());
  assert.equal(await a.api.reconcilePlainCloudWorkspace('user-1'),'pushed');
  assert.equal(await b.api.reconcilePlainCloudWorkspace('user-1'),'pulled');
  a.state.local={...a.state.local,localRevision:webcrypto.randomUUID(),
    payload:{...a.state.local.payload,customers:[{id:'A'}]}};
  b.state.local={...b.state.local,localRevision:webcrypto.randomUUID(),
    payload:{...b.state.local.payload,customers:[{id:'B'}]}};
  assert.equal(await b.api.reconcilePlainCloudWorkspace('user-1'),'pushed');
  assert.equal(await a.api.reconcilePlainCloudWorkspace('user-1'),'diverged');
  assert.equal(a.state.local.payload.customers[0].id,'A');
});
test('corrupted cloud chunk rejects hydration and preserves local data',async()=>{
  const firebase=fakeFirebase();
  const a=await client(firebase,'user-1'),b=await client(firebase,'user-1');
  a.state.local=local(payload());
  await a.api.reconcilePlainCloudWorkspace('user-1');
  const key=[...firebase.docs.keys()].find(x=>x.includes('/chunk-'));
  assert.ok(key);
  firebase.docs.set(key,{...firebase.docs.get(key),data:'AAAA'});
  await assert.rejects(b.api.reconcilePlainCloudWorkspace('user-1'),
    /integrity check|invalid length|chunk/);
  assert.equal(b.state.local,null);
});
test('cross-UID access fails closed before Firestore fetch',async()=>{
  const firebase=fakeFirebase();
  const a=await client(firebase,'user-2');
  await assert.rejects(a.api.getPlainCloudMeta('user-1'),/account.*changed/i);
});
