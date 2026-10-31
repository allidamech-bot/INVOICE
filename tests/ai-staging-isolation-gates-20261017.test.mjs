import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {inspectAiStagingBoundary,PRODUCTION_FIREBASE_PROJECT_ID} from '../scripts/verify-ai-staging-isolation.mjs';

const current=()=>({
  clientSource:readFileSync('src/cloud/firebase-config.ts','utf8'),
  serverSource:readFileSync('api/_ai/firebase-auth.js','utf8'),
  vercelSource:readFileSync('vercel.json','utf8'),
  expectedProjectId:'lourex-qa-isolated',
  vercelEnvironment:'preview',
  branchName:'fix/ai-audit-root-causes-20261017'
});
const isolated=()=>({
  clientSource:[
    "export const config={",
    "  apiKey:'AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',",
    "  projectId:'lourex-qa-isolated',",
    "  authDomain:'lourex-qa-isolated.firebaseapp.com',",
    "  storageBucket:'lourex-qa-isolated.firebasestorage.app',",
    "  messagingSenderId:'123456789012',",
    "  appId:'1:123456789012:web:abcdef1234'",
    "}"
  ].join('\n'),
  serverSource:"const FIREBASE_PROJECT_ID='lourex-qa-isolated';",
  vercelSource:JSON.stringify({rewrites:[{source:'/__/auth/:path*',destination:'https://lourex-qa-isolated.firebaseapp.com/__/auth/:path*'}]}),
  expectedProjectId:'lourex-qa-isolated',vercelEnvironment:'preview',
  branchName:'fix/ai-audit-root-causes-20261017'
});
test('QA-STAGING-01: checked-in production client, token verifier and auth rewrite must not be represented as isolated',()=>{
  const result=inspectAiStagingBoundary(current());
  assert.equal(result.ready,false);
  for(const error of ['QA_CLIENT_FIREBASE_NOT_ISOLATED','QA_BACKEND_FIREBASE_NOT_ISOLATED','QA_AUTH_DOMAIN_NOT_ISOLATED','QA_AUTH_REWRITE_NOT_ISOLATED'])
    assert.ok(result.codes.includes(error),error);
});
test('QA-STAGING-02: Preview hostname alone never qualifies as data isolation',()=>{
  const x=inspectAiStagingBoundary({...current(),expectedProjectId:PRODUCTION_FIREBASE_PROJECT_ID});
  assert.equal(x.ready,false);assert.ok(x.codes.includes('QA_DEDICATED_PROJECT_REQUIRED'));
});
test('QA-STAGING-03: isolated client with production JWT audience is unsafe',()=>{
  const p=isolated();p.serverSource="const FIREBASE_PROJECT_ID='lourex-invoice';";
  const x=inspectAiStagingBoundary(p);assert.equal(x.ready,false);
  assert.ok(x.codes.includes('QA_BACKEND_FIREBASE_NOT_ISOLATED'));
});
test('QA-STAGING-04: isolated Firebase app with production auth redirect is unsafe',()=>{
  const p=isolated();p.vercelSource=current().vercelSource;
  const x=inspectAiStagingBoundary(p);assert.equal(x.ready,false);
  assert.ok(x.codes.includes('QA_AUTH_REWRITE_NOT_ISOLATED'));
});
test('QA-STAGING-05: reject production and wrong branch',()=>{
  assert.ok(inspectAiStagingBoundary({...isolated(),vercelEnvironment:'production'}).codes.includes('QA_ENV_NOT_PREVIEW'));
  assert.ok(inspectAiStagingBoundary({...isolated(),branchName:'main'}).codes.includes('QA_WRONG_BRANCH'));
});
test('QA-STAGING-06: fully separate and consistent synthetic QA configuration passes static check',()=>{
  const result=inspectAiStagingBoundary(isolated());
  assert.equal(result.ready,true);assert.deepEqual(result.codes,[]);
});
test('QA-STAGING-07: direct CLI preflight blocks current Preview without any service or customer access',()=>{
  const r=spawnSync(process.execPath,['scripts/verify-ai-staging-isolation.mjs'],{
    encoding:'utf8',env:{...process.env,VERCEL_ENV:'preview',
      VERCEL_GIT_COMMIT_REF:'fix/ai-audit-root-causes-20261017',
      LOUREX_AI_QA_FIREBASE_PROJECT_ID:'lourex-qa-isolated'}
  });
  assert.equal(r.status,2);assert.match(r.stderr,/AI_STAGING_BLOCKED/);
  assert.doesNotMatch(r.stderr,/AIzaSy|@/,'Preflight must not print API keys or mail addresses');
});


test('QA-STAGING-08: the FIRST production build stage refuses unsafe Vercel Preview of AI release branch',()=>{
  const result=spawnSync(process.execPath,['scripts/verify-deployment-isolation.mjs'],{
    encoding:'utf8',env:{
      ...process.env,VERCEL_ENV:'preview',
      VERCEL_GIT_COMMIT_REF:'fix/ai-audit-root-causes-20261017',
      LOUREX_AI_QA_FIREBASE_PROJECT_ID:'lourex-qa-isolated'
    }
  });
  assert.notEqual(result.status,0,'Preview must not deploy an app coupled to production Firebase');
  assert.match(result.stderr,/AI_PREVIEW_ISOLATION_BLOCKED/);
  assert.doesNotMatch(result.stderr,/AIzaSy|@/,'Never reveal Firebase keys or account addresses');
});
test('QA-STAGING-09: ordinary local CI builds remain possible for synthetic tests',()=>{
  const result=spawnSync(process.execPath,['scripts/verify-deployment-isolation.mjs'],{
    encoding:'utf8',env:{
      ...process.env,VERCEL_ENV:'local',VERCEL_GIT_COMMIT_REF:'fix/ai-audit-root-causes-20261017'
    }
  });
  assert.equal(result.status,0,result.stderr);
});
test('QA-STAGING-10: production build isolation remains governed by original project/owner checks',()=>{
  const result=spawnSync(process.execPath,['scripts/verify-deployment-isolation.mjs'],{
    encoding:'utf8',env:{
      ...process.env,VERCEL_ENV:'production',
      VERCEL_GIT_REPO_OWNER:'allidamech-bot',VERCEL_GIT_REPO_SLUG:'INVOICE',
      VERCEL_PROJECT_ID:'prj_cH5bT5QF3JtbL8RzrGOxF4QCohVZ',
      VERCEL_PROJECT_PRODUCTION_URL:'invoice-three-puce.vercel.app',
      VERCEL_GIT_COMMIT_REF:'main'
    }
  });
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/deployment isolation verified/i);
});

test('QA-STAGING-11: a correct projectId cannot conceal a production Storage bucket',()=>{
  const p=isolated();
  p.clientSource=p.clientSource.replace('lourex-qa-isolated.firebasestorage.app','lourex-invoice.firebasestorage.app');
  const x=inspectAiStagingBoundary(p);
  assert.equal(x.ready,false);
  assert.ok(x.codes.includes('QA_STORAGE_BUCKET_NOT_ISOLATED'));
  assert.ok(x.codes.includes('QA_PRODUCTION_REFERENCE_PRESENT'));
});
test('QA-STAGING-12: duplicate rewrites cannot hide a production Auth destination',()=>{
  const p=isolated();
  const config=JSON.parse(p.vercelSource);
  config.rewrites.push({source:'/__/auth/:path*',destination:'https://lourex-invoice.firebaseapp.com/__/auth/:path*'});
  p.vercelSource=JSON.stringify(config);
  const x=inspectAiStagingBoundary(p);
  assert.equal(x.ready,false);
  assert.ok(x.codes.includes('QA_AUTH_REWRITE_CARDINALITY'));
  assert.ok(x.codes.includes('QA_PRODUCTION_REFERENCE_PRESENT'));
});
test('QA-STAGING-13: duplicate or commented fake fields cannot approve a production client/server',()=>{
  const p=isolated();
  p.clientSource+="\n// projectId:'lourex-qa-isolated'\nconst fail={projectId:'lourex-invoice'};";
  p.serverSource="// const FIREBASE_PROJECT_ID='lourex-qa-isolated';\nconst FIREBASE_PROJECT_ID='lourex-invoice';";
  const x=inspectAiStagingBoundary(p);
  assert.equal(x.ready,false);
  assert.ok(x.codes.includes('QA_PRODUCTION_REFERENCE_PRESENT'));
  assert.ok(x.codes.includes('QA_CLIENT_FIREBASE_NOT_ISOLATED'));
  assert.ok(x.codes.includes('QA_BACKEND_FIREBASE_NOT_ISOLATED'));
});
test('QA-STAGING-14: a complete matching QA project requires plausible Firebase client metadata',()=>{
  const p=isolated();
  p.clientSource=p.clientSource.replace('AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA','not-an-api-key');
  const x=inspectAiStagingBoundary(p);
  assert.equal(x.ready,false);
  assert.ok(x.codes.includes('QA_FIREBASE_CLIENT_METADATA_INVALID'));
});

test('QA-STAGING-15: Groq remediation preview cannot authenticate against live Firebase',()=>{
  const result=spawnSync(process.execPath,['scripts/verify-deployment-isolation.mjs'],{
    encoding:'utf8',env:{
      ...process.env,VERCEL_ENV:'preview',
      VERCEL_GIT_COMMIT_REF:'ai-legacy/groq-structured-tpm-preflight-20261101',
      LOUREX_AI_QA_FIREBASE_PROJECT_ID:'lourex-qa-isolated',
    }
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/AI_PREVIEW_ISOLATION_BLOCKED/);
  assert.doesNotMatch(result.stderr,/AIzaSy|@/);
});
test('QA-STAGING-16: Groq branch still allows offline local CI',()=>{
  const result=spawnSync(process.execPath,['scripts/verify-deployment-isolation.mjs'],{
    encoding:'utf8',env:{
      ...process.env,VERCEL_ENV:'local',
      VERCEL_GIT_COMMIT_REF:'ai-legacy/groq-structured-tpm-preflight-20261101',
    }
  });
  assert.equal(result.status,0,result.stderr);
});
