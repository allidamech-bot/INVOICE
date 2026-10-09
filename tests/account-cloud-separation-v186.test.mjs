import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const shell=read('src/components/AppShell.tsx');
const modal=read('src/components/CloudAccountModal.tsx');
const firebase=read('src/cloud/firebase.ts');
const firebaseConfig=read('src/cloud/firebase-config.ts');
const isolation=read('scripts/verify-deployment-isolation.mjs');
const index=read('index.html');
const css=read('src/styles/tailadmin-shell-v320.css');

test('account action is separate from background save status in the current application shell',()=>{
  const sync=shell.slice(shell.indexOf('private syncStatus='),shell.indexOf('private conflictBanner='));
  assert.ok(sync.length>100,'the current shell must render a sync status');
  assert.match(sync,/role="status" aria-live="polite"/);
  assert.doesNotMatch(sync,/onClick\s*=/,'passive sync state must not impersonate an account action');
  for(const target of ["ta-sidebar-sync","ta-topbar-sync","ta-sheet-sync"]){
    assert.ok(shell.includes("this.syncStatus('"+target+"')"),target+' must render sync status');
  }
  assert.match(shell,/className="ta-sidebar-account" onClick=\{this\.openAccount\}/);
  assert.match(shell,/className="ta-topbar-account"[\s\S]*?onClick=\{this\.openAccount\}/);
  assert.match(shell,/className="ta-sheet-account" onClick=\{this\.openAccount\}/);
  const handler=shell.slice(shell.indexOf('private openAccount='),shell.indexOf('private openProductInfo='));
  assert.match(handler,/requestSettingsScope\('account'\)/);
  assert.match(handler,/this\.props\.onSettings\(\)/);
});

test('existing-email recovery identifies the Invoice account and returns to sign-in',()=>{
  assert.match(modal,/A LOUREX Invoice account already exists for this email/);
  assert.match(modal,/existingInvoiceAccount\?'signin'/);
  assert.match(modal,/Forgot password\?/);
  assert.match(modal,/Use your LOUREX Invoice account to continue\. Saving and backup are automatic\./);
  assert.match(modal,/private reset=async/);
  assert.match(modal,/this\.props\.onReset\(email\)/);
  assert.match(modal,/disabled=\{this\.state\.busy\|\|!this\.state\.email\.trim\(\)\}/);
});

test('Firebase authentication is isolated from the unrelated LOUREX export deployment',()=>{
  assert.match(firebase,/import \{ LOUREX_FIREBASE_CONFIG \} from '\.\/firebase-config\.js'/);
  assert.match(firebase,/const FIREBASE_CONFIG=LOUREX_FIREBASE_CONFIG/);
  assert.match(firebaseConfig,/authDomain:'lourex-invoice\.firebaseapp\.com'/);
  assert.match(firebaseConfig,/projectId:'lourex-invoice'/);
  for(const forbidden of ['lou-rex.com','www.lou-rex.com','lourex-bf110a8a.vercel.app']){
    assert.ok(isolation.includes(forbidden),'deployment guard must prohibit '+forbidden);
  }
  assert.match(isolation,/EXPECTED_REPO_SLUG='INVOICE'/);
});

test('current account actions and passive sync indicators ship in an active stylesheet',()=>{
  assert.match(index,/href="\.\/styles\/tailadmin-shell-v320\.css/);
  for(const selector of ['.ta-sidebar-sync','.ta-topbar-sync','.ta-topbar-account','.ta-sheet-account']){
    assert.ok(css.includes(selector),'the active shell stylesheet must style '+selector);
  }
  assert.match(shell,/className="ta-topbar-actions"/);
});
