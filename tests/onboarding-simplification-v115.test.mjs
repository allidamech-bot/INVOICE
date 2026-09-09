import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v115 essential company onboarding remains compact under account-managed access',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  assert.match(auth,/account-managed-setup/);
  assert.match(auth,/WORKSPACE SETUP/);
  assert.match(auth,/Name your company/);
  assert.match(auth,/Company Name English/);
  assert.match(auth,/Company Name Arabic/);
  assert.match(auth,/Company Logo · Optional/);
  assert.match(auth,/Enter LOUREX/);
  assert.doesNotMatch(auth,/Create your LOUREX PIN|Security · 1 of 2/);
});

test('v115 setup is now protected automatically by the signed-in LOUREX account',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  assert.match(auth,/getOrCreateAccountVaultSecret\(user\.uid\)/);
  assert.match(auth,/No separate access PIN is required/);
  assert.match(auth,/One account, one sign-in/);
  assert.match(auth,/Local encrypted storage and account backup run automatically in the background/);
  assert.doesNotMatch(auth,/Keep this PIN safe|account password cannot replace or recover this PIN/i);
});

test('v115 defers advanced company details to Settings instead of blocking first use',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const setup=auth.slice(auth.indexOf('export class SetupScreen'),auth.indexOf('interface UnlockProps'));
  assert.doesNotMatch(setup,/Address English/);
  assert.doesNotMatch(setup,/Commercial Registration/);
  assert.doesNotMatch(setup,/Bank Name/);
  assert.doesNotMatch(setup,/Signature/);
  assert.doesNotMatch(setup,/Stamp/);
  assert.match(setup,/Address, tax, bank details, signature, stamp and document defaults remain available in Settings/i);
});

test('v115 onboarding presentation stays compact and touch safe while v189 adds account-managed polish',async()=>{
  const [legacyCss,unifiedCss]=await Promise.all([
    read('src/styles/onboarding-simplification-v115.css'),
    read('src/styles/unified-account-v189.css')
  ]);
  assert.match(legacyCss,/\.setup-card-v115/);
  assert.match(legacyCss,/\.setup-company-essential-grid/);
  assert.match(legacyCss,/@media\(max-width:720px\)/);
  assert.match(legacyCss,/@media\(pointer:coarse\)/);
  assert.match(unifiedCss,/\.account-managed-security-note/);
  assert.match(unifiedCss,/\.account-managed-setup/);
});

test('v115 remains loaded and cached while v189 owns the current account-access generation',async()=>{
  const [index,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const ux='./styles/onboarding-simplification-v115.css';
  const perf='./styles/performance-polish-v100.css';
  assert.ok(index.indexOf(ux)>-1&&index.indexOf(ux)<index.indexOf(perf));
  assert.ok(sw.includes(ux));
  assert.match(sw,/v115/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v189';$/m);
  assert.match(sw,/lourex-invoice-v188: preserved as a legacy marker/);
});