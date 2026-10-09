import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v187 signed-out account entry preserves accessible bilingual TailAdmin gateway and trust signals',async()=>{
  const [screen,css]=await Promise.all([
    read('src/components/AccountEntryScreen.tsx'),
    read('src/styles/tailadmin-auth-v320.css')
  ]);
  for(const marker of ['ta-auth-page','ta-auth-frame','ta-auth-aside','ta-auth-main','ta-auth-card','ta-auth-primary','ta-auth-security','Forgot password?','lourex-auth-just-signed-out']){
    assert.ok(screen.includes(marker),marker);
  }
  assert.match(screen,/className="ta-auth-tabs" role="tablist"/);
  assert.match(screen,/aria-selected=\{!create\}/);
  assert.match(screen,/aria-selected=\{create\}/);
  assert.match(screen,/role="tabpanel"/);
  assert.match(screen,/type="password" autoComplete=/);
  assert.match(css,/\.ta-auth-page\{[\s\S]*min-height:100dvh/);
  assert.match(css,/\.ta-auth-page\{[\s\S]*background:var\(--ft-workspace\)/);
  assert.match(css,/\.ta-auth-frame\{[\s\S]*display:grid;grid-template-columns/);
  assert.match(css,/\.ta-auth-aside\{[\s\S]*background:linear-gradient/);
  assert.match(css,/\.ta-auth-card\{[\s\S]*display:flex/);
  assert.match(css,/\.ta-auth-language\{min-height:44px/);
  assert.match(css,/@media\(max-width:900px\)/);
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
