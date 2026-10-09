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

test('Google account link requires verified existing password and preserves UID-scoped local storage',async()=>{
  const account=await read('src/components/AccountEntryScreen.tsx');
  const google=await read('src/cloud/google-auth.ts');
  const onFailure=account.slice(account.indexOf('private applyGoogleFailure='),account.indexOf('private finishGoogleRedirect='));
  const enter=account.slice(account.indexOf('private enterAuthenticatedAccount='),account.indexOf('private prepareGoogle='));
  assert.match(account,/Continue with Google/);
  assert.match(account,/المتابعة باستخدام Google/);
  assert.match(onFailure,/error instanceof GoogleAccountLinkRequiredError/);
  assert.match(onFailure,/googleLinkPending:true/);
  assert.match(onFailure,/existing LOUREX password once to connect Google without changing your data/);
  assert.match(onFailure,/كلمة مرور LOUREX الحالية مرة واحدة لربط Google دون تغيير بياناتك/);
  assert.doesNotMatch(onFailure,/activateAccountStorage|enterAuthenticatedAccount|clearSession/);
  assert.match(account,/linkGoogleToExistingPasswordAccount/);
  assert.match(google,/signInWithEmailAndPassword\(email\.trim\(\),password\)/);
  assert.match(google,/existingUser\.linkWithCredential\(pendingGoogleCredential\)/);
  assert.match(google,/user\.uid!==originalUid/);
  assert.match(enter,/setActiveAccountUid\(user\.uid\)/);
  assert.match(enter,/await activateAccountStorage\(user\.uid\)/);
  assert.ok(enter.indexOf('window.location.replace')>enter.indexOf('await activateAccountStorage(user.uid)'));
  assert.match(account,/\[LOUREX Google Auth\]/);
});

test('Firebase authentication config keeps its own project and canonical auth domain',async()=>{
  const firebase=await read('src/cloud/firebase.ts');
  const config=await read('src/cloud/firebase-config.ts');
  const pkg=JSON.parse(await read('package.json'));
  assert.match(firebase,/import \{ LOUREX_FIREBASE_CONFIG \} from '\.\/firebase-config\.js'/);
  assert.match(firebase,/const FIREBASE_CONFIG=LOUREX_FIREBASE_CONFIG/);
  assert.match(config,/authDomain:'lourex-invoice\.firebaseapp\.com'/);
  assert.match(config,/projectId:'lourex-invoice'/);
  assert.doesNotMatch(config,/lou-rex\.com|lourex-bf110a8a/);
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

test('current Google sign-in is accessible and visibly styled in mobile, dark and RTL modes',async()=>{
  const [account,ui,dark,index,i18n]=await Promise.all([
    read('src/components/AccountEntryScreen.tsx'),
    read('src/styles/tailadmin-design-closeout-v323.css'),
    read('src/styles/matte-black-dark-v360.css'),
    read('index.html'),
    read('src/lib/i18n.ts')
  ]);
  assert.match(account,/className="ta-google-button" disabled=\{this\.state\.busy\|\|!this\.state\.googleReady\}/);
  assert.match(account,/onClick=\{\(\)=>void this\.googleSignIn\(\)\}/);
  assert.match(account,/className="ta-auth-divider"/);
  assert.match(ui,/\.ta-google-button\{min-height:46px!important/);
  assert.match(dark,/data-ui-theme="dark"[\s\S]*\.ta-google-button/);
  assert.match(index,/tailadmin-design-closeout-v323\.css/);
  assert.match(index,/matte-black-dark-v360\.css/);
  assert.match(i18n,/document\.documentElement\.dir = language === 'ar' \? 'rtl' : 'ltr'/);
  assert.match(account,/المتابعة باستخدام Google/);
});

test('v216 keeps the critical stale-Firebase PWA activation path and preserves prior cache generations',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v216'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v215'.*legacy marker/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v214'.*legacy marker/);
  assert.match(patch,/\.\/src\/cloud\/google-auth\.js/);
  assert.match(patch,/v214 forced-activation migration is retired/);
  assert.match(patch,/Explicit user-requested SW activation handler is missing/);
  assert.doesNotMatch(patch,/await self\.skipWaiting\(\)/);
  const sw=await read('dist/sw.js');
  const install=sw.slice(sw.indexOf("self.addEventListener('install'"),sw.indexOf("self.addEventListener('message'"));
  assert.doesNotMatch(install,/skipWaiting\(/,'service worker must wait for explicit user update action');
  assert.match(sw,/event\.data\?\.type==='SKIP_WAITING'/);
  assert.match(sw,/void self\.skipWaiting\(\)/);
});

test('service worker reloads only after explicit approval and never discards an active editor',async()=>{
  const entry=await read('src/app/index.tsx');
  const safety=entry.slice(entry.indexOf('function safeSignedOutAuthGatewayForAutomaticReload'),entry.indexOf("window.addEventListener('lourex-cloud-applied'"));
  const controller=entry.slice(entry.indexOf("navigator.serviceWorker.addEventListener('controllerchange'"),entry.indexOf("void navigator.serviceWorker.register('./sw.js')"));
  assert.match(safety,/!currentCloudUser\(\)/);
  assert.match(safety,/!reloadUnsafeWorkspaceOpen\(\)/);
  assert.match(safety,/\.ta-auth-page,\.auth-page/);
  assert.match(controller,/const userRequestedReload=reloadForUpdate/);
  assert.match(controller,/if\(!userRequestedReload\)return/);
  assert.match(controller,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}/);
  assert.match(controller,/rememberWorkspaceBeforeAutomaticReload\(\)/);
  assert.match(controller,/window\.location\.replace\(window\.location\.href\)/);
  assert.doesNotMatch(controller,/safeSignedOutAuthGatewayForAutomaticReload\(\)/);
});

