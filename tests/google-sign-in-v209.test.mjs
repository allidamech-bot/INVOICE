import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v212 uses direct popup auth on every browser and clears legacy redirect state',async()=>{
  const google=await read('src/cloud/google-auth.ts');
  assert.match(google,/signInWithPopup\(googleProvider\)/);
  assert.doesNotMatch(google,/signInWithRedirect\(googleProvider\)/);
  assert.match(google,/LEGACY_GOOGLE_REDIRECT_PENDING_KEY/);
  assert.match(google,/clearLegacyRedirectState/);
  assert.match(google,/googleRedirectPending\(\):boolean\{[\s\S]*return false/);
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

test('v212 account gateway keeps safe-link recovery without starting redirect completion',async()=>{
  const account=await read('src/components/AccountEntryScreen.tsx');
  assert.match(account,/Continue with Google/);
  assert.match(account,/المتابعة باستخدام Google/);
  assert.match(account,/GoogleAccountLinkRequiredError/);
  assert.match(account,/googleLinkPending/);
  assert.match(account,/linkGoogleToExistingPasswordAccount/);
  assert.match(account,/UID and cloud data stay unchanged/);
  assert.match(account,/سيبقى حساب LOUREX ومعرّفه وبياناته السحابية دون تغيير/);
  assert.match(account,/\[LOUREX Google Auth\]/);
});

test('v212 production build keeps Firebase default authDomain and no longer applies same-origin patch',async()=>{
  const firebase=await read('src/cloud/firebase.ts');
  const pkg=JSON.parse(await read('package.json'));
  assert.match(firebase,/authDomain:'lourex-invoice\.firebaseapp\.com'/);
  assert.doesNotMatch(pkg.scripts.build,/firebase-auth-same-origin-v211\.mjs/);
});

test('v213 production runtime upgrades Firebase compat bundles to the iOS popup-fixed 12.19.0 release',async()=>{
  const upgrade=await read('scripts/firebase-sdk-v213.mjs');
  const pkg=JSON.parse(await read('package.json'));
  assert.match(upgrade,/FIREBASE_VERSION='12\.19\.0'/);
  assert.match(upgrade,/firebase-auth-compat\.js/);
  assert.match(upgrade,/firebase-app-compat\.js/);
  assert.match(upgrade,/firebase-app-check-compat\.js/);
  assert.match(upgrade,/firebase-firestore-compat\.js/);
  assert.match(pkg.scripts.build,/firebase-sdk-v213\.mjs/);
});

test('v213 CSP allows only the Google script origins required by Firebase federated auth',async()=>{
  const config=JSON.parse(await read('vercel.json'));
  const hardened=config.headers?.find(item=>item.headers?.some(header=>header.key==='Content-Security-Policy'));
  const csp=hardened?.headers?.find(header=>header.key==='Content-Security-Policy')?.value||'';
  assert.match(csp,/script-src 'self' https:\/\/apis\.google\.com https:\/\/www\.gstatic\.com;/);
  assert.doesNotMatch(csp,/script-src [^;]*(?:cdn\.jsdelivr\.net|unpkg\.com)/);
  assert.doesNotMatch(csp,/script-src [^;]*'unsafe-inline'/);
});

test('legacy Firebase auth helper proxy remains isolated for old v211 clients during cache migration',async()=>{
  const config=JSON.parse(await read('vercel.json'));
  const rule=config.rewrites?.find(item=>item.source==='/__/auth/:path*');
  assert.ok(rule,'legacy same-origin Firebase auth rewrite must remain during v213 migration');
  assert.equal(rule.destination,'https://lourex-invoice.firebaseapp.com/__/auth/:path*');
  const hardened=config.headers?.find(item=>item.headers?.some(header=>header.key==='Content-Security-Policy'));
  assert.ok(hardened,'LOUREX application hardening header rule must exist');
  assert.equal(hardened.source,'/((?!__/auth/).*)');
});

test('v209 Google entry is styled for premium desktop, mobile and RTL layouts',async()=>{
  const css=await read('src/styles/maintenance-closeout-v207.css');
  assert.match(css,/\.google-auth-button\{/);
  assert.match(css,/\.google-auth-mark\{/);
  assert.match(css,/\.auth-provider-divider\{/);
  assert.match(css,/\[dir='rtl'\] \.auth-account-card \.google-auth-button\{direction:rtl\}/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.google-auth-button/);
});

test('v214 forces the stale Firebase PWA generation to activate and preserves prior cache markers',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v214'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v213'.*legacy marker/);
  assert.match(patch,/\.\/src\/cloud\/google-auth\.js/);
  assert.match(patch,/await self\.skipWaiting\(\)/);
  assert.match(patch,/critical v214 service-worker activation/);
});

test('v214 auto-reloads only the safe signed-out auth gateway after worker activation',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.match(entry,/safeSignedOutAuthGatewayForAutomaticReload/);
  assert.match(entry,/!currentCloudUser\(\)/);
  assert.match(entry,/document\.querySelector\('\.auth-page'\)/);
  assert.match(entry,/if\(safeSignedOutAuthGatewayForAutomaticReload\(\)\)window\.location\.replace\(window\.location\.href\)/);
  assert.match(entry,/reloadUnsafeWorkspaceOpen\(\)/);
});
