import test from 'node:test';
import assert from 'node:assert/strict';
import {
  R07EExperimentalPrivateSourceRepository,
  R07E_PRODUCTION_SOURCE_STORAGE_ACTIVATED,R07E_OBJECT_PREFIX,
} from '../../dist/src/ai-next/storage/cloud-source-objects.js';
import {
  sourceScopeKey,sha256,ingestDocument,
} from '../../dist/src/ai-next/document-engine/engine.js';
import {TextSourceAdapter,CsvSourceAdapter}
  from '../../dist/src/ai-next/document-engine/adapters.js';

const scope={
  ownerUid:'r07e-owner',accountId:'r07e-account',companyId:'r07e-company',
  branchId:'r07e-branch',threadId:'r07e-thread',actorId:'r07e-owner',
  role:'owner',scopeType:'business',authorizationVersion:1,
};
const enc=new TextEncoder(),copy=x=>structuredClone(x);
const err=(code,msg)=>Object.assign(new Error(msg??String(code)),{code});
class SyntheticGcsBucket{
  objects=new Map();files=[];writes=0;downloads=0;failNextSave=null;
  file(objectName){
    this.files.push(objectName);
    const bucket=this;
    return {
      async save(bytes,options){
        assert.equal(options.resumable,false);
        assert.equal(options.preconditionOpts.ifGenerationMatch,0);
        if(bucket.failNextSave){
          const code=bucket.failNextSave;bucket.failNextSave=null;throw err(code);
        }
        if(bucket.objects.has(objectName))throw err(412);
        bucket.objects.set(objectName,{
          bytes:new Uint8Array(bytes),
          custom:copy(options.metadata.metadata),
        });
        bucket.writes++;
      },
      async getMetadata(){
        const found=bucket.objects.get(objectName);
        if(!found)throw err(404);
        return [{size:String(found.bytes.byteLength),metadata:copy(found.custom)}];
      },
      async download(){
        const found=bucket.objects.get(objectName);
        if(!found)throw err(404);
        bucket.downloads++;
        return [new Uint8Array(found.bytes)];
      },
    };
  }
}
async function file(id='doc-1',text='synthetic source body',other={}){
  const bytes=enc.encode(text);
  return {
    scopeKey:sourceScopeKey(scope),documentId:id,fileName:id+'.txt',
    format:'text',sha256:await sha256(bytes),bytes,...other,
  };
}
const repo=bucket=>new R07EExperimentalPrivateSourceRepository(bucket);
test('R07E cloud storage remains disabled; scope path is private not users tree',()=>{
  assert.equal(R07E_PRODUCTION_SOURCE_STORAGE_ACTIVATED,false);
  assert.equal(R07E_OBJECT_PREFIX,'ai-next/private-sources/v1');
  assert.doesNotMatch(R07E_OBJECT_PREFIX,/\/users\//);
});
test('source persists unchanged, full bytes and SHA readable from independent instance',async()=>{
  const bucket=new SyntheticGcsBucket(),a=repo(bucket),b=repo(bucket);
  const original=await file('report','عناصر التجربة و السعر ٢٠');
  const before=new Uint8Array(original.bytes);
  await a.store(original);
  original.bytes.fill(0);
  const found=await b.read(sourceScopeKey(scope),'report');
  assert.deepEqual(found.bytes,before);
  assert.equal(found.sha256,await sha256(before));
  assert.equal(found.fileName,'report.txt');
  assert.equal(bucket.writes,1);
  assert.equal(bucket.objects.size,1);
  const path=bucket.files[0];
  assert.match(path,/^ai-next\/private-sources\/v1\/[a-f0-9]{64}\/[a-f0-9]{64}$/);
  assert.equal(path.includes('r07e-owner'),false);
});
test('same scoped file replay is accepted without overwrite or second object',async()=>{
  const bucket=new SyntheticGcsBucket(),a=repo(bucket),b=repo(bucket);
  const original=await file();
  await a.store(original);
  await b.store(original);
  assert.equal(bucket.writes,1);
  assert.equal(bucket.downloads,1,'replay compares actual persisted bytes');
});
test('concurrent identical uploads cannot generate second version',async()=>{
  const bucket=new SyntheticGcsBucket(),original=await file();
  await Promise.all([
    repo(bucket).store(original),repo(bucket).store(copy(original)),
  ]);
  assert.equal(bucket.writes,1);
  assert.equal(bucket.objects.size,1);
});
test('same scoped ID with differing bytes or format/name never overwrites original',async()=>{
  const bucket=new SyntheticGcsBucket(),a=repo(bucket),original=await file();
  await a.store(original);
  for(const different of [
    await file('doc-1','different bytes'),
    {...original,fileName:'alternate.txt'},
    {...original,format:'csv',fileName:'doc-1.csv'},
  ]){
    await assert.rejects(a.store(different),/R07E_SOURCE_ID_COLLISION/);
  }
  assert.deepEqual((await a.read(sourceScopeKey(scope),'doc-1')).bytes,original.bytes);
  assert.equal(bucket.writes,1);
});
test('unknown scoped object returns null and prevents cross-account read',async()=>{
  const bucket=new SyntheticGcsBucket(),a=repo(bucket);
  await a.store(await file());
  for(const override of [
    {ownerUid:'other'},{accountId:'other'},{companyId:'other'},
    {branchId:'other'},{threadId:'other'},{actorId:'other'},
    {authorizationVersion:2},
  ]){
    assert.equal(await a.read(sourceScopeKey({...scope,...override}),'doc-1'),null);
  }
  assert.equal(await a.read(sourceScopeKey(scope),'nonexistent'),null);
});
test('malformed source key and attempted traversal rejected before object storage',async()=>{
  const bucket=new SyntheticGcsBucket(),a=repo(bucket);
  for(const bad of ['not-json','[]',
    JSON.stringify([...JSON.parse(sourceScopeKey(scope)),null])]){
    await assert.rejects(a.read(bad,'doc'),/R07E_INVALID_SCOPE_KEY/);
  }
  await assert.rejects(a.read(sourceScopeKey(scope),'bad\nID'),
    /R07E_INVALID_DOCUMENT_ID/);
  assert.equal(bucket.objects.size,0);
});
test('tampered stored binary cannot be read as original',async()=>{
  const bucket=new SyntheticGcsBucket(),a=repo(bucket);
  await a.store(await file());
  const value=[...bucket.objects.values()][0];
  value.bytes[0]^=1;
  await assert.rejects(a.read(sourceScopeKey(scope),'doc-1'),
    /R07E_BINARY_INTEGRITY_MISMATCH/);
});
test('metadata tamper and altered source size cannot pass',async()=>{
  for(const change of [
    x=>{x.custom.documentId='other';},
    x=>{x.custom.sha256='0'.repeat(64);},
    x=>{x.custom.scopeHash='1'.repeat(64);},
    x=>{x.custom.format='executable';},
    x=>{x.custom.fileName='../bad\nfile';},
    x=>{x.bytes=new Uint8Array();},
  ]){
    const bucket=new SyntheticGcsBucket(),a=repo(bucket);
    await a.store(await file());
    const record=[...bucket.objects.values()][0];
    change(record);
    await assert.rejects(a.read(sourceScopeKey(scope),'doc-1'),/R07E_/);
  }
});
test('invalid source SHA and empty file rejected without cloud access',async()=>{
  const bucket=new SyntheticGcsBucket(),a=repo(bucket),base=await file();
  await assert.rejects(a.store({...base,sha256:'0'.repeat(64)}),
    /R07E_UPLOAD_DIGEST_MISMATCH/);
  await assert.rejects(a.store({...base,bytes:new Uint8Array()}),
    /R07E_INVALID_BINARY_SIZE/);
  await assert.rejects(a.store({...base,fileName:'bad\nname'}),
    /R07E_INVALID_OBJECT_HEADER/);
  assert.equal(bucket.writes,0);
  assert.equal(bucket.files.length,0);
});
test('provider outage is propagated and does not trigger insecure fallback',async()=>{
  const bucket=new SyntheticGcsBucket(),a=repo(bucket);
  bucket.failNextSave=503;
  await assert.rejects(a.store(await file()),e=>e.code===503);
  assert.equal(bucket.objects.size,0);
  assert.equal(bucket.writes,0);
});
test('read backend outage is not interpreted as missing source',async()=>{
  const bucket=new SyntheticGcsBucket(),a=repo(bucket);
  bucket.file=()=>({getMetadata:async()=>{throw err(503);}});
  await assert.rejects(a.read(sourceScopeKey(scope),'doc'),e=>e.code===503);
});
test('R02 ingests actual UTF-8 original through private source repo with exact source hash',async()=>{
  const bucket=new SyntheticGcsBucket(),storage=repo(bucket);
  const bytes=enc.encode('original synthetic Arabic invoice نص عربي ١٢٣٤ and price unknown');
  const run=await ingestDocument({
    source:{documentId:'note-1',format:'text',fileName:'note-1.txt',
      mimeType:'text/plain',bytes},
    scope,adapter:new TextSourceAdapter(),repository:storage,
    runId:'r07e-run',now:'2026-10-30T17:00:00.000Z',
  });
  assert.equal(run.coverage.status,'complete');
  assert.equal(run.sourceSha256,await sha256(bytes));
  assert.equal(run.financialDraftEligible,false);
  assert.equal(bucket.writes,1);
  assert.deepEqual((await storage.read(sourceScopeKey(scope),'note-1')).bytes,bytes);
});
test('R02 CSV preserves quoted repeated values and newlines from immutable stored bytes',async()=>{
  const bucket=new SyntheticGcsBucket(),storage=repo(bucket);
  const bytes=enc.encode('name,qty,price\nTea,1,\nTea,2,\n"Tea,\nherbal",3,');
  const run=await ingestDocument({
    source:{documentId:'csv-1',format:'csv',fileName:'csv-1.csv',
      mimeType:'text/csv',bytes},
    scope,adapter:new CsvSourceAdapter(),repository:storage,
    runId:'r07e-csv',now:'2026-10-30T17:00:00.000Z',
  });
  assert.equal(run.coverage.status,'complete');
  assert.equal(run.financialDraftEligible,false);
  assert.ok(run.evidence.some(x=>x.rawValue==='Tea,\nherbal'));
});
