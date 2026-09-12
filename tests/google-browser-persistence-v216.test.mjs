import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v216 prepares Google popup auth away from IndexedDB before the user gesture',async()=>{
  const google=await read('src/cloud/google-auth.ts');
  assert.match(google,/export async function prepareGooglePopupAuth\(\):Promise<void>/);
  assert.match(google,/setPersistence\(firebase\.auth\.Auth\.Persistence\.NONE\)/);
  assert.match(google,/setPersistence\(firebase\.auth\.Auth\.Persistence\.SESSION\)/);
  const signIn=google.slice(google.indexOf('export async function signInCloudUserWithGoogle'),google.indexOf('export async function linkGoogleToExistingPasswordAccount'));
  assert.match(signIn,/if\(!googlePopupPrepared\)/);
  assert.match(signIn,/signInWithPopup\(googleProvider\)/);
  assert.doesNotMatch(signIn,/await instance\.setPersistence[^\n]*before/i);
});

test('v216 migrates the authenticated Google session only after the opener is visible again',async()=>{
  const google=await read('src/cloud/google-auth.ts');
  const persist=google.slice(google.indexOf('async function waitUntilVisible'),google.indexOf('function captureLinkRequirement'));
  assert.match(persist,/document\.visibilityState==='visible'/);
  assert.match(persist,/visibilitychange/);
  assert.ok(persist.indexOf('await waitUntilVisible()')<persist.indexOf('Persistence.LOCAL'));
  assert.match(persist,/Persistence\.SESSION/);
  assert.match(persist,/await instance\.signOut\(\)/);
});

test('v216 account gateway disables Google until persistence preparation is complete',async()=>{
  const account=await read('src/components/AccountEntryScreen.tsx');
  assert.match(account,/prepareGooglePopupAuth/);
  assert.match(account,/googleReady:boolean/);
  assert.match(account,/googleReady:false/);
  assert.match(account,/void this\.prepareGoogle\(\)/);
  assert.match(account,/disabled=\{this\.state\.busy\|\|!this\.state\.googleReady\}/);
  assert.match(account,/Preparing Google…/);
  assert.match(account,/جارٍ تجهيز Google…/);
});

test('v216 browser cache cannot reuse a pre-12.19 Firebase Auth vendor response',async()=>{
  const sdk=await read('scripts/firebase-sdk-v213.mjs');
  assert.match(sdk,/FIREBASE_VERSION='12\.19\.0'/);
  assert.match(sdk,/firebase-auth-compat\.js\?v=\$\{FIREBASE_VERSION\}/);
  assert.match(sdk,/replaceAll\(local,`\$\{local\}\?v=\$\{FIREBASE_VERSION\}`\)/);
});

test('v216 recovery never deletes LOUREX account databases or encrypted vault data',async()=>{
  const google=await read('src/cloud/google-auth.ts');
  assert.doesNotMatch(google,/indexedDB\.deleteDatabase|lourex-invoice-account-|deleteRecord\(['"]vault['"]\)/);
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v216'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v215'.*legacy marker/);
  assert.match(patch,/await self\.skipWaiting\(\)/);
});
