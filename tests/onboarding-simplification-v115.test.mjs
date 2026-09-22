import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v302 essential company onboarding stays compact while adding the required PIN gate',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  assert.match(auth,/account-managed-setup/);
  assert.match(auth,/WORKSPACE SETUP/);
  assert.match(auth,/Set up your protected workspace/);
  assert.match(auth,/Company Name English/);
  assert.match(auth,/Company Name Arabic/);
  assert.match(auth,/Company Logo · Optional/);
  assert.match(auth,/Create PIN · 4–12 digits/);
  assert.match(auth,/Confirm PIN/);
});

test('v302 setup uses account plus a separate user PIN instead of account-secret auto unlock',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const setup=auth.slice(auth.indexOf('export class SetupScreen'),auth.indexOf('interface UnlockProps'));
  assert.match(setup,/PIN_PATTERN/);
  assert.match(setup,/onFinish\(this\.state\.pin, this\.state\.company\)/);
  assert.match(setup,/Account \+ PIN protection/);
  assert.match(setup,/After signing in, LOUREX asks for this PIN/);
  assert.doesNotMatch(setup,/getOrCreateAccountVaultSecret/);
  assert.doesNotMatch(setup,/No separate access PIN is required/);
});

test('v115 still defers advanced company details to Settings instead of blocking first use',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const setup=auth.slice(auth.indexOf('export class SetupScreen'),auth.indexOf('interface UnlockProps'));
  assert.doesNotMatch(setup,/Address English/);
  assert.doesNotMatch(setup,/Commercial Registration/);
  assert.doesNotMatch(setup,/Bank Name/);
  assert.doesNotMatch(setup,/Signature/);
  assert.doesNotMatch(setup,/Stamp/);
  assert.match(setup,/Address, tax, bank details, signature, stamp and document defaults remain available in Settings/i);
});

test('v302 onboarding presentation stays compact and touch safe with account-plus-PIN polish',async()=>{
  const [legacyCss,unifiedCss,v302Css]=await Promise.all([
    read('src/styles/onboarding-simplification-v115.css'),
    read('src/styles/unified-account-v189.css'),
    read('src/styles/security-documents-closeout-v302.css')
  ]);
  assert.match(legacyCss,/\.setup-card-v115/);
  assert.match(legacyCss,/\.setup-company-essential-grid/);
  assert.match(legacyCss,/@media\(max-width:720px\)/);
  assert.match(legacyCss,/@media\(pointer:coarse\)/);
  assert.match(unifiedCss,/\.account-managed-security-note/);
  assert.match(v302Css,/\.setup-pin-grid/);
  assert.match(v302Css,/\.pin-lock-badge/);
});

test('v115 remains loaded and cached while the current security generation advances safely',async()=>{
  const [index,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const ux='./styles/onboarding-simplification-v115.css';
  const perf='./styles/performance-polish-v100.css';
  assert.ok(index.indexOf(ux)>-1&&index.indexOf(ux)<index.indexOf(perf));
  assert.ok(sw.includes(ux));
  assert.match(sw,/v115/);
  assert.match(index,/security-documents-closeout-v302\.css\?v=302/);
  const versions=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  const current=Number(versions.at(-1)?.[1]);
  assert.ok(Number.isInteger(current)&&current>=196,'current immutable PWA generation must not regress below v196');
  assert.match(sw,/lourex-invoice-v188: preserved as a legacy marker/);
});
