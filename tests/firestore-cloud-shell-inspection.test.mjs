import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const inspect=fileURLToPath(new URL('../scripts/inspect-live-firestore-rules.mjs',import.meta.url));
const mock=fileURLToPath(new URL('./fixtures/mock-firebase-rules-read.mjs',import.meta.url));
function inspectSandbox(patch={},args=[]){
 const home=mkdtempSync(join(tmpdir(),'lourex-firebase-inspect-'));
 const bin=join(home,'bin');
 mkdirSync(bin,{mode:0o700});
 writeFileSync(join(bin,'gcloud'),
   '#!/bin/sh\nif [ "$1" = "auth" ] && [ "$2" = "print-access-token" ]; then\n printf "synthetic-test-access-token\\n"\nelse\n exit 17\nfi\n',
   {mode:0o700});
 const env={...process.env,
  HOME:home,PATH:bin+':'+(process.env.PATH||''),
  CI:'',VERCEL:'',VERCEL_ENV:'',
  LOUREX_FIREBASE_PROJECT_ID:'lourex-invoice',...patch};
 const result=spawnSync(process.execPath,['--import',mock,inspect,...args],
  {env,encoding:'utf8',timeout:8500});
 return {home,result};
}
test('Cloud Shell script GETs live rules only, saves a private backup and reports hashes without credentials',()=>{
 const {home,result}=inspectSandbox();
 try{
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/READ_ONLY_COMPLETE: no production write or deployment was attempted/);
  assert.match(result.stdout,/DIFFERENT: live rules do not match/);
  assert.match(result.stdout,/Live rules SHA-256: [a-f0-9]{64}/);
  assert.match(result.stdout,/Candidate rules SHA-256: [a-f0-9]{64}/);
  assert.doesNotMatch(result.stdout+result.stderr,/synthetic-test-access-token/);
  const backups=readdirSync(join(home,'lourex-firestore-rules-backups'));
  assert.equal(backups.length,1);
  const path=join(home,'lourex-firestore-rules-backups',backups[0]);
  const data=readFileSync(path,'utf8');
  assert.match(data,/rules_version = '2';/);
 }finally{rmSync(home,{recursive:true,force:true});}
});
test('Cloud Shell inspection rejects unexpected project, CLI switches and CI environment before accessing credentials',()=>{
 for(const [patch,args] of [
  [{LOUREX_FIREBASE_PROJECT_ID:'another-project'},[]],
  [{CI:'true'},[]],
  [{VERCEL:'1'},[]],
  [{},['--deploy']]
 ]){
  const {home,result}=inspectSandbox(patch,args);
  try{
   assert.equal(result.status,2,result.stderr);
   assert.match(result.stderr,/LIVE_RULES_INSPECTION_BLOCKED/);
   assert.doesNotMatch(result.stdout+result.stderr,/synthetic-test-access-token/);
  }finally{rmSync(home,{recursive:true,force:true});}
 }
});
test('Cloud Shell inspection refuses untrusted cross-project release name; no backup is written',()=>{
 const {home,result}=inspectSandbox({TEST_BAD_RELEASE:'yes'});
 try{
  assert.equal(result.status,2);
  assert.match(result.stderr,/Unexpected Firebase ruleset identifier/);
  assert.doesNotMatch(result.stdout+result.stderr,/synthetic-test-access-token/);
 }finally{rmSync(home,{recursive:true,force:true});}
});
