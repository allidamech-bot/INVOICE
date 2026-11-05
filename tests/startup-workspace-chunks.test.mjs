import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {startupCloudRead,StartupReadTimeout} from '../src/cloud/startup-read.ts';

async function fixture({badIndex=-1,staleManifest=false}={}){
  const source=await readFile(new URL('../src/cloud/plain-workspace.ts',import.meta.url),'utf8');
  const start=source.indexOf('export async function downloadPlainCloudWorkspace(');
  const end=source.indexOf('// Orphan chunks are intentionally left untouched',start);
  assert.ok(start>=0&&end>start,'extract real download implementation');
  const compiled=ts.transpileModule(source.slice(start,end),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  const payload={schemaVersion:21,documents:[],padding:'x'.repeat(640)};
  const bytes=Buffer.from(JSON.stringify(payload)),chunkBytes=8;
  const chunks=Array.from({length:Math.ceil(bytes.length/chunkBytes)},(_,index)=>({
    revision:'cloud-revision-123456',
    index:index===badIndex?999:index,
    data:bytes.subarray(index*chunkBytes,Math.min(bytes.length,(index+1)*chunkBytes)).toString('base64')
  }));
  const meta={format:'LOUREX_PLAIN_WORKSPACE_V2',version:2,
    revision:'cloud-revision-123456',schemaVersion:21,bytes:bytes.length,
    chunkCount:chunks.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  let active=0,maxActive=0,reads=0,manifestReads=0;
  const phases=[],extended=[],exports={};
  const cloudRead=fn=>fn();
  cloudRead.extendForLargeWorkspace=count=>extended.push(count);
  const context={
    exports,Promise,Uint8Array,TextDecoder,
    requireUid:uid=>assert.equal(uid,'owner'),
    validMeta:value=>value?.revision===meta.revision&&value?.bytes===meta.bytes,
    getPeriodCloudControl:async()=>null,
    getPlainCloudMeta:async()=>{manifestReads++;return staleManifest&&manifestReads>0?{...meta,revision:'changed-manifest'}:meta;},
    directRead:fn=>fn(),
    traceStartupCloudRead:(_read,phase)=>phases.push(phase),
    CHUNK_BYTES:chunkBytes,
    collection:uid=>{
      assert.equal(uid,'owner');
      return {doc:id=>({get:async()=>{
        const index=Number(id.slice(-5));
        reads++;active++;maxActive=Math.max(maxActive,active);
        await new Promise(resolve=>setTimeout(resolve,0));
        active--;
        return {exists:index>=0&&index<chunks.length,data:()=>chunks[index]};
      }})};
    },
    chunkId:(rev,index)=>'chunk-'+rev+'-'+String(index).padStart(5,'0'),
    firebase:{firestore(){throw Error('unexpected protected namespace');}},
    decodeB64:value=>Uint8Array.from(Buffer.from(value,'base64')),
    sha256:async value=>createHash('sha256').update(value).digest('hex'),
    assertRestorableBackupVault:()=>{}
  };
  vm.runInNewContext(compiled,context);
  return {restore:()=>exports.downloadPlainCloudWorkspace('owner',meta,cloudRead),
    payload,phases,extended,stats:()=>({reads,maxActive,chunkCount:chunks.length})};
}

test('large cloud workspace uses bounded 16-request batches and verifies SHA-256 plus final manifest',async()=>{
  const f=await fixture();
  const result=await f.restore();
  assert.deepEqual(JSON.parse(JSON.stringify(result.payload)),f.payload);
  assert.ok(f.stats().chunkCount>=32);
  assert.deepEqual(f.extended,[f.stats().chunkCount]);
  assert.equal(f.stats().reads,f.stats().chunkCount);
  assert.equal(f.stats().maxActive,16);
  assert.ok(f.phases.includes('workspace-chunks-progress'));
  assert.ok(f.phases.includes('workspace-hash-verified'));
  assert.ok(f.phases.includes('workspace-manifest-rechecked'));
  assert.ok(f.phases.includes('workspace-payload-verified'));
});

test('corrupt immutable chunk fails closed before returning any workspace',async()=>{
  const f=await fixture({badIndex:2});
  await assert.rejects(f.restore(),/chunk is missing or invalid/);
  assert.ok(!f.phases.includes('workspace-hash-verified'));
});

test('a changed server manifest cannot be accepted after a complete download',async()=>{
  const f=await fixture({staleManifest:true});
  await assert.rejects(f.restore(),/changed during download/);
  assert.ok(!f.phases.includes('workspace-payload-verified'));
});

test('small transfers keep the 20s deadline; large validated transfers gain at most 28s total',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const small=startupCloudRead(20_000);
  small.extendForLargeWorkspace?.(31);
  const a=assert.rejects(small(()=>new Promise(()=>{})),StartupReadTimeout);
  t.mock.timers.tick(20_000);
  await a;
  const large=startupCloudRead(20_000);
  t.mock.timers.tick(1000);
  large.extendForLargeWorkspace?.(32);
  const b=assert.rejects(large(()=>new Promise(()=>{})),StartupReadTimeout);
  t.mock.timers.tick(19_000);
  await Promise.resolve();
  t.mock.timers.tick(7_000);
  await b;
  await assert.rejects(large(()=>Promise.resolve('late')),StartupReadTimeout);
});
