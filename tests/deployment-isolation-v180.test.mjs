import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const script='scripts/verify-deployment-isolation.mjs';
const run=overrides=>spawnSync(process.execPath,[script],{
  encoding:'utf8',
  env:{
    ...process.env,
    VERCEL_ENV:'production',
    VERCEL_GIT_REPO_OWNER:'allidamech-bot',
    VERCEL_GIT_REPO_SLUG:'INVOICE',
    VERCEL_PROJECT_ID:'prj_invoice_isolated_test',
    VERCEL_PROJECT_PRODUCTION_URL:'invoice-three-puce.vercel.app',
    ...overrides,
  },
});

test('deployment isolation guard is wired before the production build',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(pkg.scripts.build,'node scripts/verify-deployment-isolation.mjs && node scripts/build.mjs');
});

test('deployment isolation guard accepts the canonical INVOICE repository on an isolated project',()=>{
  const result=run({});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/deployment isolation verified/i);
});

test('deployment isolation guard rejects the primary lou-rex.com Vercel project id',()=>{
  const result=run({VERCEL_PROJECT_ID:'prj_KgRgeJKQKIu2F2ElkrbfEEXDUtA3'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/forbidden Vercel project/i);
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
