import test from 'node:test';
import assert from 'node:assert/strict';
import {hashAuthorityEvidence,writeAuthorityEvidence,readAuthorityEvidence,MAX_AUTHORITY_EVIDENCE} from '../api/_fiscal/authority-evidence.js';
const fixture=()=>{
  const data=new Map(),db={doc:path=>({path})};
  const tx={create(ref,value){if(data.has(ref.path))throw Error('exists');data.set(ref.path,structuredClone(value));},async get(ref){return {exists:data.has(ref.path),data:()=>structuredClone(data.get(ref.path))};}};
  return {data,db,tx,ref:db.doc('private/event/artifacts/result')};
};
test('small historical-format evidence remains readable and immutable',async()=>{
  const {data,db,tx,ref}=fixture(),bytes=Buffer.from('synthetic response'),digest=hashAuthorityEvidence(bytes);
  writeAuthorityEvidence(tx,db,ref,bytes,digest);
  assert.deepEqual(data.get(ref.path),{sha256:digest,bytes:bytes.toString('base64')});
  assert.deepEqual(await readAuthorityEvidence(tx,db,ref,digest),bytes);
  assert.throws(()=>writeAuthorityEvidence(tx,db,ref,bytes,digest),/exists/);
});
test('full 2 MiB evidence uses four bounded immutable chunks and verifies reconstructed bytes',async()=>{
  const {data,db,tx,ref}=fixture(),bytes=Buffer.alloc(MAX_AUTHORITY_EVIDENCE,42),digest=hashAuthorityEvidence(bytes);
  writeAuthorityEvidence(tx,db,ref,bytes,digest);
  assert.equal(data.get(ref.path).chunkCount,4);assert.equal(data.size,5);
  for(const [key,value] of data)if(key!==ref.path)assert.ok(Buffer.byteLength(JSON.stringify(value))<1024*1024);
  assert.deepEqual(await readAuthorityEvidence(tx,db,ref,digest),bytes);
  const key=ref.path+'/chunks/1';data.delete(key);
  await assert.rejects(readAuthorityEvidence(tx,db,ref,digest),/INVALID_AUTHORITY_CHUNK/);
});
test('partial final chunk, corrupted or substituted evidence fail closed',async()=>{
  const {data,db,tx,ref}=fixture(),bytes=Buffer.alloc(512*1024+1,7),digest=hashAuthorityEvidence(bytes);
  assert.throws(()=>writeAuthorityEvidence(tx,db,ref,bytes,'0'.repeat(64)),/MISMATCH/);assert.equal(data.size,0);
  writeAuthorityEvidence(tx,db,ref,bytes,digest);
  assert.deepEqual(await readAuthorityEvidence(tx,db,ref,digest),bytes);
  const key=ref.path+'/chunks/1',chunk=data.get(key);data.set(key,{...chunk,bytes:'AA=='});
  await assert.rejects(readAuthorityEvidence(tx,db,ref,digest),/INVALID_AUTHORITY_CHUNK/);
  assert.throws(()=>hashAuthorityEvidence(Buffer.alloc(MAX_AUTHORITY_EVIDENCE+1)),/INVALID_AUTHORITY_EVIDENCE/);
});
