import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v211 uses redirect on iOS while retaining popup for desktop browsers',async()=>{
  const google=await read('src/cloud/google-auth.ts');
  assert.match(google,/shouldUseRedirectFlow/);
  assert.match(google,/iPad\|iPhone\|iPod/);
  assert.match(google,/signInWithRedirect\(googleProvider\)/);
  assert.match(google,/signInWithPopup\(googleProvider\)/);
  assert.match(google,/getRedirectResult\(\)/);
  assert.match(google,/GOOGLE_REDIRECT_PENDING_KEY/);
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

test('v211 account gateway consumes redirect completion and keeps safe-link recovery',async()=>{
  const account=await read('src/components/AccountEntryScreen.tsx');
  assert.match(account,/Continue with Google/);
  assert.match(account,/المتابعة باستخدام Google/);
  assert.match(account,/consumeGoogleRedirectResult/);
  assert.match(account,/googleRedirectPending/);
  assert.match(account,/finishGoogleRedirect/);
  assert.match(account,/GoogleAccountLinkRequiredError/);
  assert.match(account,/googleLinkPending/);
  assert.match(account,/linkGoogleToExistingPasswordAccount/);
  assert.match(account,/UID and cloud data stay unchanged/);
  assert.match(account,/سيبقى حساب LOUREX ومعرّفه وبياناته السحابية دون تغيير/);
  assert.match(account,/\[LOUREX Google Auth\]/);
});

test('v211 production build patches Firebase authDomain to the canonical LOUREX origin only',async()=>{
  const patch=await read('scripts/firebase-auth-same-origin-v211.mjs');
  const pkg=JSON.parse(await read('package.json'));
  assert.match(patch,/invoice-three-puce\.vercel\.app/);
  assert.match(patch,/lourex-invoice\.firebaseapp\.com/);
  assert.match(patch,/VERCEL_ENV/);
  assert.match(patch,/VERCEL_PROJECT_ID/);
  assert.match(patch,/authDomain/);
  assert.match(pkg.scripts.build,/firebase-auth-same-origin-v211\.mjs/);
});

test('v211 Vercel transparently proxies Firebase auth helpers instead of redirecting them',async()=>{
  const config=JSON.parse(await read('vercel.json'));
  const rule=config.rewrites?.find(item=>item.source==='/__/auth/:path*');
  assert.ok(rule,'same-origin Firebase auth rewrite must exist');
  assert.equal(rule.destination,'https://lourex-invoice.firebaseapp.com/__/auth/:path*');
});

test('v209 Google entry is styled for premium desktop, mobile and RTL layouts',async()=>{
  const css=await read('src/styles/maintenance-closeout-v207.css');
  assert.match(css,/\.google-auth-button\{/);
  assert.match(css,/\.google-auth-mark\{/);
  assert.match(css,/\.auth-provider-divider\{/);
  assert.match(css,/\[dir='rtl'\] \.auth-account-card \.google-auth-button\{direction:rtl\}/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.google-auth-button/);
});

test('v211 advances the installed PWA cache and precaches the Google auth module',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v211'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v210'.*legacy marker/);
  assert.match(patch,/\.\/src\/cloud\/google-auth\.js/);
  assert.match(patch,/requiredRuntimes/);
});
