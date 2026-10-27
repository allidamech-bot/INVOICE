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
  assert.match(result.stdout,/READ_ONLY_COMPLETE: no Firebase write, deployment or Rules publish attempted/);
  assert.match(result.stdout,/SOURCE_DIFFERENT: inspect the private backup/);
  assert.match(result.stdout,/Live rules SHA-256: [a-f0-9]{64}/);
  assert.match(result.stdout,/Checkout rules SHA-256: [a-f0-9]{64}/);
  assert.doesNotMatch(result.stdout+result.stderr,/synthetic-test-access-token/);
  const backups=readdirSync(join(home,'lourex-firestore-rules-backups'));
  assert.equal(backups.length,2,'published Rules source and private provenance JSON are both preserved');
  const rulesName=backups.find(name=>name.endsWith('.rules'));
  const manifestName=backups.find(name=>name.endsWith('.evidence.json'));
  assert.ok(rulesName&&manifestName);
  const data=readFileSync(join(home,'lourex-firestore-rules-backups',rulesName),'utf8');
  assert.match(data,/rules_version = '2';/);
  const evidence=JSON.parse(readFileSync(join(home,'lourex-firestore-rules-backups',manifestName),'utf8'));
  assert.equal(evidence.releaseName,'projects/lourex-invoice/releases/cloud.firestore');
  assert.equal(evidence.rulesetName,'projects/lourex-invoice/rulesets/fixture_01');
  assert.equal(evidence.releaseMetadataComplete,true);
  assert.equal(evidence.byteExactMatch,false);
  assert.match(evidence.publishedSourceSha256,/^[0-9a-f]{64}$/);
  assert.equal(evidence.acceptanceStatus,'PENDING_INDEPENDENT_SECURITY_REVIEW');
  assert.doesNotMatch(JSON.stringify(evidence),/synthetic-test-access-token/);
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
  assert.match(result.stderr,/Unexpected published Firebase release\/ruleset identifier/);
  assert.doesNotMatch(result.stdout+result.stderr,/synthetic-test-access-token/);
 }finally{rmSync(home,{recursive:true,force:true});}
});
