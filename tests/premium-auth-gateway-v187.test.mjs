import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v187 signed-out account entry is a dedicated premium LOUREX gateway',async()=>{
  const [screen,css]=await Promise.all([
    read('src/components/AccountEntryScreen.tsx'),
    read('src/styles/auth-entry.css')
  ]);
  assert.match(screen,/auth-account-page/);
  assert.match(screen,/auth-account-frame/);
  assert.match(screen,/auth-account-story/);
  assert.match(screen,/auth-story-trust/);
  assert.match(screen,/auth-account-card/);
  assert.match(screen,/premium-auth-primary/);
  assert.match(screen,/Forgot password\?/);
  assert.match(screen,/lourex-auth-just-signed-out/);
  assert.match(css,/\.auth-account-page\{[\s\S]*min-height:100dvh/);
  assert.match(css,/\.auth-account-frame\{[\s\S]*grid-template-columns/);
  assert.match(css,/\.auth-account-story\{[\s\S]*linear-gradient/);
  assert.match(css,/\.auth-account-card\.account-first-card\{[\s\S]*background:linear-gradient/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/\[dir="rtl"\] \.auth-account-page/);
});

test('v187 account sign-out closes the unlocked workspace before returning to login',async()=>{
  const modal=await read('src/components/CloudAccountModal.tsx');
  assert.match(modal,/import \{ suspendSession \} from '\.\.\/storage\/session\.js'/);
  const start=modal.indexOf('private signOut=async');
  const end=modal.indexOf('render():any',start);
  assert.ok(start>=0&&end>start);
  const signOut=modal.slice(start,end);
  assert.match(signOut,/await this\.props\.onSignOut\(\)/);
  assert.match(signOut,/await suspendSession\(\)/);
  assert.match(signOut,/sessionStorage\.setItem\('lourex-auth-just-signed-out','1'\)/);
  assert.match(signOut,/window\.location\.reload\(\)/);
  assert.doesNotMatch(signOut,/deleteRecord\('vault'\)|deleteRecord\('security'\)/);
});

test('v187 service worker bytes change so installed Safari and PWA clients retain the premium gateway assets',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/v187 premium account gateway/);
  assert.ok(sw.includes('./styles/auth-entry.css'));
  assert.ok(sw.includes('./src/components/AccountEntryScreen.js'));
  assert.ok(sw.includes('./src/components/CloudAccountModal.js'));
  assert.match(sw,/lourex-invoice-v185: preserved as a legacy marker/);
});
