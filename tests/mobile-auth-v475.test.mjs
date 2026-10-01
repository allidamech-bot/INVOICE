import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [auth,reliability,account,authScreens]=await Promise.all([
  read('src/styles/mobile-auth-v475.css'),
  read('src/styles/tailadmin-reliability-bridge-v320.css'),
  read('src/components/AccountEntryScreen.tsx'),
  read('src/components/AuthScreens.tsx')
]);

test('v475.6 secure-access layer is loaded after the other mobile presentation layers',()=>{
  assert.match(reliability,/@import url\("\.\/mobile-auth-v475\.css\?v=475-6"\);/);
  assert.ok(reliability.indexOf('mobile-overlays-v475.css?v=475-5')<reliability.indexOf('mobile-auth-v475.css?v=475-6'));
  assert.ok(reliability.indexOf('mobile-auth-v475.css?v=475-6')<reliability.indexOf('/* LOUREX v351'));
  assert.match(auth,/Presentation-only mobile treatment/);
  assert.match(auth,/@media screen and \(max-width:900px\)/);
});

test('v475.6 covers sign-in/create, setup, PIN/unlock and recovery surfaces',()=>{
  for(const selector of ['.ta-auth-page','.ta-auth-frame','.ta-auth-card','.ta-auth-mobile-brand','.ta-google-button','.ta-auth-tabs','.ta-auth-fields','.ta-auth-primary','.ta-setup-card','.ta-unlock-card','.auth-recovery-state']){
    assert.ok(auth.includes(selector),`missing secure-access styling for ${selector}`);
  }
  assert.match(account,/ta-auth-page/);
  assert.match(account,/ta-auth-card/);
  assert.match(authScreens,/ta-auth-page/);
  assert.match(authScreens,/ta-unlock-card/);
});

test('v475.6 preserves Arabic typography, safe areas and touch sizing',()=>{
  assert.match(auth,/font-family:"Noto Sans Arabic",Inter/);
  assert.match(auth,/env\(safe-area-inset-top,0px\)/);
  assert.match(auth,/env\(safe-area-inset-bottom,0px\)/);
  assert.match(auth,/min-height:44px/);
  assert.match(auth,/font-size:16px/);
  assert.match(auth,/prefers-reduced-motion:reduce/);
});

test('v475.6 is presentation-only and cannot mutate auth, PIN, vault or cloud state',()=>{
  const forbidden=['localStorage','indexedDB','firebase','firestore','mutateVault','resumeVault','setState(','signIn','signOut','password','pinHash','vault.'];
  for(const token of forbidden){
    const pattern=new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
    assert.doesNotMatch(auth,pattern);
  }
});
