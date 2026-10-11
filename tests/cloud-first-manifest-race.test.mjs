import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source=()=>readFile(new URL('../src/cloud/plain-workspace.ts',import.meta.url),'utf8');
const compile=(src,start,end)=>{
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a);
  return ts.transpileModule(src.slice(a,b),{compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
  }}).outputText;
};

test('a completed manifest keeps its chunks even when auth changes after commit',async()=>{
  const compiled=compile(await source(),'export async function uploadPlainCloudWorkspace(', '/** Reads remote revisions');
  const exports={},chunks=new Map();
  let meta=null,committed=false,deleted=0;
  const store={
    batch(){
      const pending=[];
      return {
        set:(ref,doc)=>pending.push([ref.id,doc]),
        delete:()=>{deleted++;},
        commit:async()=>{pending.forEach(([id,doc])=>chunks.set(id,doc));}
      };
    },
    runTransaction:async fn=>fn({
      get:async()=>({exists:false}),
      set:(_ref,manifest)=>{meta=manifest;committed=true;}
    })
  };
  const ctx={
    exports,Uint8Array,Date,Promise,
    navigator:{onLine:true},
    requireUid:()=>{if(committed)throw new Error('Session changed');},
    encodePayload:()=>new Uint8Array([1,2]),
    sha256:async()=> 'a'.repeat(64),
    getPlainCloudMeta:async()=>null,
    newRevision:()=> 'rev-1234567890123',
    CHUNK_BYTES:180000,WRITE_BATCH_SIZE:12,FORMAT:'LOUREX_PLAIN_WORKSPACE_V2',
    chunkId:(rev,i)=>rev+'-'+i,
    collection:()=>({doc:id=>({id})}),
    metaRef:()=>({id:'meta'}),
    b64:()=> 'AQI=',
    firebase:{firestore:()=>store},
    acknowledgePlainWorkspace:async()=>true
  };
  vm.runInNewContext(compiled,ctx);
  const local={uid:'a',schemaVersion:1,payload:{schemaVersion:1},localRevision:'r1',
    updatedAt:'2026-10-11T10:00:00Z',baseCloudRevision:null,baseCloudSha256:null};
  await assert.rejects(exports.uploadPlainCloudWorkspace('a',local),/Session changed/);
  assert.ok(meta&&chunks.size>0);
  assert.equal(deleted,0);
});

test('same cloud SHA with a newer local generation retries rather than claiming synced',async()=>{
  const compiled=compile(await source(),'export async function reconcilePlainCloudWorkspace(', '/** Notify other devices');
  const exports={};
  const snapshot={uid:'uid',localRevision:'local-a',baseCloudRevision:'remote-old',
    baseCloudSha256:'1'.repeat(64),payload:{schemaVersion:1}};
  vm.runInNewContext(compiled,{
    exports,Promise,requireUid:()=>{},
    getPlainWorkspace:async()=>snapshot,
    getPlainCloudMeta:async()=>({revision:'remote-new',sha256:'2'.repeat(64)}),
    sha256:async()=> '2'.repeat(64),
    encodePayload:()=>new Uint8Array([1,2]),
    acknowledgeIdenticalPlainWorkspace:async()=>false
  });
  assert.equal(await exports.reconcilePlainCloudWorkspace('uid'),'retry');
});

test('cloud pull losing an IndexedDB generation race retries without overwriting new invoice edits',async()=>{
  const compiled=compile(await source(),'export async function reconcilePlainCloudWorkspace(', '/** Notify other devices');
  const exports={};
  const local={uid:'uid',localRevision:'local-a',baseCloudRevision:'cloud-a',
    baseCloudSha256:'1'.repeat(64),payload:{schemaVersion:1}};
  let attempts=0;
  vm.runInNewContext(compiled,{
    exports,Promise,crypto:{randomUUID:()=> 'replacement-b'},requireUid:()=>{},
    getPlainWorkspace:async()=>local,
    getPlainCloudMeta:async()=>({revision:'cloud-b',sha256:'2'.repeat(64)}),
    sha256:async()=> '1'.repeat(64),
    encodePayload:()=>new Uint8Array([1]),
    downloadPlainCloudWorkspace:async()=>({payload:{schemaVersion:1},meta:{
      revision:'cloud-b',sha256:'2'.repeat(64),updatedAt:'2026-10-11T10:00:00Z'
    }}),
    replacePlainWorkspaceIfUnchanged:async()=>{attempts++;return false;}
  });
  assert.equal(await exports.reconcilePlainCloudWorkspace('uid'),'retry');
  assert.equal(attempts,1,'stale remote state must not overwrite concurrently changed local data');
});
