import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v209 Google sign-in uses Firebase LOCAL persistence and a user-triggered popup',async()=>{
  const google=await read('src/cloud/google-auth.ts');
  assert.match(google,/new firebase\.auth\.GoogleAuthProvider\(\)/);
  assert.match(google,/setPersistence\(firebase\.auth\.Auth\.Persistence\.LOCAL\)/);
  assert.match(google,/signInWithPopup\(provider\)/);
  assert.match(google,/prompt:'select_account'/);
});

test('v209 preserves an existing LOUREX uid by linking Google only after password verification',async()=>{
  const google=await read('src/cloud/google-auth.ts');
  assert.match(google,/account-exists-with-different-credential/);
  assert.match(google,/GoogleAuthProvider\.credentialFromError/);
  assert.match(google,/signInWithEmailAndPassword\(email\.trim\(\),password\)/);
  assert.match(google,/existingUser\.linkWithCredential\(pendingGoogleCredential\)/);
  assert.match(google,/user\.uid!==originalUid/);
  assert.match(google,/await instance\.signOut\(\)/);
});

test('v209 account gateway exposes bilingual Google entry and explicit safe-link state',async()=>{
  const account=await read('src/components/AccountEntryScreen.tsx');
  assert.match(account,/Continue with Google/);
  assert.match(account,/المتابعة باستخدام Google/);
  assert.match(account,/GoogleAccountLinkRequiredError/);
  assert.match(account,/googleLinkPending/);
  assert.match(account,/linkGoogleToExistingPasswordAccount/);
  assert.match(account,/UID and cloud data stay unchanged/);
  assert.match(account,/سيبقى حساب LOUREX ومعرّفه وبياناته السحابية دون تغيير/);
});

test('v209 Google entry is styled for premium desktop, mobile and RTL layouts',async()=>{
  const css=await read('src/styles/maintenance-closeout-v207.css');
  assert.match(css,/\.google-auth-button\{/);
  assert.match(css,/\.google-auth-mark\{/);
  assert.match(css,/\.auth-provider-divider\{/);
  assert.match(css,/\[dir='rtl'\] \.auth-account-card \.google-auth-button\{direction:rtl\}/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.google-auth-button/);
});

test('v209 advances the installed PWA cache and precaches the Google auth module',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v209'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v208'.*legacy marker/);
  assert.match(patch,/\.\/src\/cloud\/google-auth\.js/);
  assert.match(patch,/requiredRuntimes/);
});
