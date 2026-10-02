import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const executable=source=>source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\s)\/\/.*$/gm,'$1');
const recoveryBlock=source=>{
  const start=source.indexOf('function recoverLateAuthenticatedAccount(){');
  const end=source.indexOf('\n\n  function noteAppliedCloudVault',start);
  assert.ok(start>=0&&end>start,'late-auth recovery block is missing');
  return source.slice(start,end);
};

test('v482 late authenticated account guard never hard reloads the running workspace',async()=>{
  const guard=await read('public/runtime-no-auto-reload-v482.js');
  const code=executable(guard);
  assert.match(code,/lourex-cloud-refresh-available/,'cloud refresh recovery hook is missing');
  assert.match(code,/addEventListener\('lourex-cloud-refresh-available',recoverWithoutReload,true\)/,'recovery guard must run in capture phase before the legacy document-entry listener');
  assert.match(code,/event\.stopImmediatePropagation\(\)/,'legacy hard-reload listener is not intercepted');
  assert.match(code,/lourex-account-transition-request/,'recovery must use the in-app account transition protocol');
  assert.match(code,/automaticReload:false/,'recovery transition must declare its no-reload contract');
  assert.doesNotMatch(code,/(?:window\.)?location\s*\.\s*(?:reload|replace|assign)\s*\(/,'v482 recovery guard must never execute page navigation');
  assert.doesNotMatch(code,/history\s*\.\s*go\s*\(/,'v482 recovery guard must never use history navigation as a reload surrogate');
});

test('v482 production finalizer loads the guard before legacy document-entry and precaches it',async()=>{
  const finalize=await read('scripts/v347-startup-finalize.mjs');
  assert.match(finalize,/runtimeNoAutoReload='\.\/runtime-no-auto-reload-v482\.js\?v=482'/,'production guard asset is not wired');
  assert.match(finalize,/html\.indexOf\(runtimeNoAutoReload\)<=html\.indexOf\(runtimeSafety\)\|\|html\.indexOf\(runtimeNoAutoReload\)>=html\.indexOf\(newDocumentEntry\)/,'guard ordering contract is missing');
  assert.match(finalize,/themeBootstrap,runtimeNoAutoReload,storageCleanup/,'guard is not included in final service-worker precache verification');
});

test('v482 generated document-entry recovery uses only in-app account transition',async()=>{
  const [bundler,entry]=await Promise.all([
    read('scripts/v482-bundle-mobile-ux-repair.mjs'),
    read('dist/document-entry-v302.js')
  ]);
  assert.match(bundler,/lateAuthRecovery/,'v482 bundler does not harden generated document-entry recovery');
  const block=executable(recoveryBlock(entry));
  assert.match(block,/lourex-account-transition-request/,'generated recovery lost the in-app transition request');
  assert.match(block,/automaticReload:false/,'generated recovery lost the no-reload contract');
  assert.doesNotMatch(block,/(?:window\.)?location\s*\.\s*(?:reload|replace|assign)\s*\(/,'generated late-auth recovery still hard navigates');
  assert.doesNotMatch(block,/history\s*\.\s*go\s*\(/,'generated late-auth recovery uses history navigation as reload surrogate');
});
