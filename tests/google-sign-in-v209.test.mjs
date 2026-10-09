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
  assert.match(account,/connect Google without changing your data/);
  assert.match(account,/ربط Google دون تغيير بياناتك/);
  assert.match(account,/if\(this\.state\.googleLinkPending\)user=await linkGoogleToExistingPasswordAccount\(email,password\)/);
  const google=await read('src/cloud/google-auth.ts');
  assert.match(google,/const originalUid=String\(existingUser\.uid\|\|''\)/);
  assert.match(google,/!originalUid\|\|user\.uid!==originalUid/);
  assert.match(google,/await existingUser\.linkWithCredential\(pendingGoogleCredential\)/);
  assert.match(google,/catch\(error\)\{[\s\S]*await instance\.signOut\(\)/);
  assert.match(account,/\[LOUREX Google Auth\]/);
});

test('v212 production build keeps Firebase default authDomain and no longer applies same-origin patch',async()=>{
  const [firebase,config]=await Promise.all([read('src/cloud/firebase.ts'),read('src/cloud/firebase-config.ts')]);
  const pkg=JSON.parse(await read('package.json'));
  assert.match(firebase,/import \{ LOUREX_FIREBASE_CONFIG \} from '\.\/firebase-config\.js'/);
  assert.match(firebase,/const FIREBASE_CONFIG=LOUREX_FIREBASE_CONFIG/);
  assert.match(config,/authDomain:'lourex-invoice\.firebaseapp\.com'/);
  assert.match(config,/projectId:'lourex-invoice'/);
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

test('v209 Google entry uses the active premium theme, mobile touch target and global RTL direction',async()=>{
  const [page,css,dark,account,lang]=await Promise.all([
    read('index.html'),
    read('src/styles/tailadmin-design-closeout-v323.css'),
    read('src/styles/matte-black-dark-v360.css'),
    read('src/components/AccountEntryScreen.tsx'),
    read('src/lib/i18n.ts')
  ]);
  assert.match(page,/tailadmin-design-closeout-v323\.css/);
  assert.match(page,/matte-black-dark-v360\.css/);
  assert.match(account,/className="ta-google-button"/);
  assert.match(account,/Continue with Google/);
  assert.match(account,/المتابعة باستخدام Google/);
  assert.match(account,/disabled=\{this\.state\.busy\|\|!this\.state\.googleReady\}/);
  assert.match(css,/\.ta-google-button\{min-height:46px!important;border-radius:11px!important;\}/);
  assert.match(dark,/html\[data-ui-theme="dark"\] body \.ta-auth-page :is\(\.ta-google-button/);
  assert.match(lang,/document\.documentElement\.dir = language === 'ar' \? 'rtl' : 'ltr'/);
  assert.match(account,/this\.props\.language==='ar'\?'en':'ar'/);
});

test('v216 keeps the critical stale-Firebase PWA activation path and preserves prior cache generations',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v216'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v215'.*legacy marker/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v214'.*legacy marker/);
  assert.match(patch,/\.\/src\/cloud\/google-auth\.js/);
  assert.match(patch,/await self\.skipWaiting\(\)/);
  assert.match(patch,/critical v214 service-worker activation/);
});

test('v214 worker activation never reloads an editing workspace without an explicit user update',async()=>{
  const entry=await read('src/app/index.tsx');
  const controller=entry.slice(entry.indexOf("navigator.serviceWorker.addEventListener('controllerchange'"),entry.indexOf("void navigator.serviceWorker.register('./sw.js')"));
  assert.ok(controller.length>100,'controllerchange handler must be present');
  assert.match(controller,/const userRequestedReload=reloadForUpdate/);
  assert.match(controller,/if\(!userRequestedReload\)return/);
  assert.match(controller,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}/);
  assert.match(controller,/rememberWorkspaceBeforeAutomaticReload\(\)/);
  assert.match(controller,/window\.location\.replace\(window\.location\.href\)/);
  assert.doesNotMatch(controller,/safeSignedOutAuthGatewayForAutomaticReload\(\)/);
  assert.match(entry,/function reloadUnsafeWorkspaceOpen\(\):boolean/);
  assert.match(entry,/if\(isDocumentEditorOpen\(\)\)/);
  assert.match(entry,/function updateNoticeDeferredForWorkspace\(\):void/);
});
