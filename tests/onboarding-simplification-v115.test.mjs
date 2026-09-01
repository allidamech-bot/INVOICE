import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v115 first-run setup is only PIN plus essential company identity',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  assert.match(auth,/step: 1\|2;/);
  assert.doesNotMatch(auth,/step: 1\|2\|3/);
  assert.match(auth,/Security · 1 of 2/);
  assert.match(auth,/Company · 2 of 2/);
  assert.match(auth,/Company Name English/);
  assert.match(auth,/Company Name Arabic/);
  assert.match(auth,/Company Logo · Optional/);
  assert.match(auth,/Finish Setup/);
});

test('v115 clearly explains that the account password cannot recover the vault PIN',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  assert.match(auth,/Keep this PIN safe/);
  assert.match(auth,/account password cannot replace or recover this PIN/i);
  assert.match(auth,/same PIN to unlock restored encrypted data/i);
});

test('v115 defers advanced company details to Settings instead of blocking first use',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const setup=auth.slice(auth.indexOf('export class SetupScreen'),auth.indexOf('interface UnlockProps'));
  assert.doesNotMatch(setup,/Address English/);
  assert.doesNotMatch(setup,/Commercial Registration/);
  assert.doesNotMatch(setup,/Bank Name/);
  assert.doesNotMatch(setup,/Signature/);
  assert.doesNotMatch(setup,/Stamp/);
  assert.match(setup,/address, tax, bank details, signature and stamp can be completed later from Settings/i);
});

test('v115 onboarding presentation stays compact and touch safe',async()=>{
  const css=await read('src/styles/onboarding-simplification-v115.css');
  assert.match(css,/\.setup-card-v115/);
  assert.match(css,/\.pin-recovery-note/);
  assert.match(css,/\.setup-company-essential-grid/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/@media\(pointer:coarse\)/);
});

test('v115 loads before the final performance layer and is cached offline',async()=>{
  const [index,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const ux='./styles/onboarding-simplification-v115.css';
  const perf='./styles/performance-polish-v100.css';
  assert.ok(index.indexOf(ux)>-1&&index.indexOf(ux)<index.indexOf(perf));
  assert.ok(sw.includes(ux));
  assert.match(sw,/v115/);
  assert.match(sw,/v114/);
  assert.match(sw,/v113/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v101'/);
});
