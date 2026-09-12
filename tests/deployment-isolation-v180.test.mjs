import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const script='scripts/verify-deployment-isolation.mjs';
const EXPECTED_PROJECT_ID='prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ';
const run=overrides=>spawnSync(process.execPath,[script],{
  encoding:'utf8',
  env:{
    ...process.env,
    VERCEL_ENV:'production',
    VERCEL_GIT_REPO_OWNER:'allidamech-bot',
    VERCEL_GIT_REPO_SLUG:'INVOICE',
    VERCEL_PROJECT_ID:EXPECTED_PROJECT_ID,
    VERCEL_PROJECT_PRODUCTION_URL:'invoice-three-puce.vercel.app',
    ...overrides,
  },
});

test('deployment isolation guard is wired before the production build',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  const buildSteps=pkg.scripts.build.split('&&').map(step=>step.trim());
  assert.deepEqual(buildSteps,[
    'node scripts/verify-deployment-isolation.mjs',
    'node scripts/build.mjs',
    'node scripts/firebase-sdk-v213.mjs',
    'node scripts/pwa-cache-v205.mjs',
  ]);
  assert.equal(buildSteps[0],'node scripts/verify-deployment-isolation.mjs');
});

test('deployment isolation guard accepts only the canonical INVOICE repository on the dedicated project',()=>{
  const result=run({});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/deployment isolation verified/i);
  assert.match(result.stdout,new RegExp(EXPECTED_PROJECT_ID));
});

test('deployment isolation guard rejects the primary lou-rex.com Vercel project id',()=>{
  const result=run({VERCEL_PROJECT_ID:'prj_KgRgeJKQKIu2F2ElkrbfEEXDUtA3'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/unexpected Vercel project/i);
});

test('deployment isolation guard rejects any other Vercel project id',()=>{
  const result=run({VERCEL_PROJECT_ID:'prj_other_invoice_project'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/unexpected Vercel project/i);
  assert.match(result.stderr,new RegExp(EXPECTED_PROJECT_ID));
});

test('deployment isolation guard fails closed without Vercel project metadata',()=>{
  const result=run({VERCEL_PROJECT_ID:''});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/without VERCEL_PROJECT_ID/i);
});

test('deployment isolation guard rejects lou-rex.com production hosts',()=>{
  for(const host of ['lou-rex.com','www.lou-rex.com','lourex-bf110a8a.vercel.app','lourex-bf110a8a-alidaamishs-projects.vercel.app']){
    const result=run({VERCEL_PROJECT_PRODUCTION_URL:host});
    assert.notEqual(result.status,0,host);
    assert.match(result.stderr,/forbidden production host/i,host);
  }
});

test('deployment isolation guard rejects any non-INVOICE Git source',()=>{
  const result=run({VERCEL_GIT_REPO_SLUG:'lourex-bf110a8a'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/production source must be allidamech-bot\/INVOICE/i);
});

test('deployment isolation guard fails closed without Vercel Git source metadata',()=>{
  const result=run({VERCEL_GIT_REPO_OWNER:'',VERCEL_GIT_REPO_SLUG:''});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/without Vercel Git source metadata/i);
});

test('direct production build guard also requires the dedicated project id',async()=>{
  const build=await readFile('scripts/build.mjs','utf8');
  assert.match(build,/EXPECTED_PROJECT_ID='prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ'/);
  assert.match(build,/unexpected Vercel project/);
  assert.match(build,/VERCEL_PROJECT_ID/);
});
