import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSdk4Manifest,encodeManifest} from '../scripts/fiscal/prepare-aws-sdk4-manifest.mjs';
function fixture(fn){
 const tmp=mkdtempSync(join(tmpdir(),'lourex-sdk4-manifest-'));
 try{
  const root=join(tmp,'sdk'),archive=join(tmp,'official.zip');
  mkdirSync(join(root,'Apps'),{recursive:true});mkdirSync(join(root,'Configuration'));
  writeFileSync(join(root,'Apps/fatoora'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  writeFileSync(join(root,'Apps/zatca-einvoicing-sdk-238-R4.0.0.jar'),'synthetic fixture');
  writeFileSync(join(root,'Configuration/config.json'),'{}');
  writeFileSync(archive,'synthetic ZIP for local test only');
  const expectedArchiveSha256=createHash('sha256').update('synthetic ZIP for local test only').digest('hex');
  return fn({tmp,root,archive,expectedArchiveSha256});
 }finally{rmSync(tmp,{recursive:true,force:true});}
}
test('exact archive checksum plus complete staged files yields deterministically hashed manifest',()=>fixture(f=>{
 const a=buildSdk4Manifest(f),b=buildSdk4Manifest(f);
 assert.deepEqual(a,b);
 assert.equal(a.sdkVersion,'4.0.0');assert.equal(a.sdkArchiveSha256,f.expectedArchiveSha256);
 assert.equal(Object.keys(a.files).length,3);
 assert.equal(a.launcher,'Apps/fatoora');
 assert.equal(a.sdkConfig,'Configuration/config.json');
 assert.match(createHash('sha256').update(encodeManifest(a)).digest('hex'),/^[0-9a-f]{64}$/);
}));
test('refuses a different archive rather than claiming official provenance',()=>fixture(f=>{
 assert.throws(()=>buildSdk4Manifest({...f,expectedArchiveSha256:'0'.repeat(64)}),/ARCHIVE_SHA_MISMATCH/);
}));
test('refuses SDK symlinks, including an injected Data directory',()=>fixture(f=>{
 symlinkSync(f.archive,join(f.root,'Apps/injected'));
 assert.throws(()=>buildSdk4Manifest(f),/UNSUPPORTED_FILE/);
}));
test('refuses malformed SDK configuration',()=>fixture(f=>{
 writeFileSync(join(f.root,'Configuration/config.json'),'invalid json');
 assert.throws(()=>buildSdk4Manifest(f),/INVALID_CONFIG/);
}));
test('refuses missing archive',()=>fixture(f=>{
 assert.throws(()=>buildSdk4Manifest({...f,archive:join(f.tmp,'absent.zip')}),/MISSING_ARCHIVE/);
}));
