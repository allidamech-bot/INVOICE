import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('account entry remains a distinct action, and sync indicators are non-interactive statuses',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  const open=shell.slice(shell.indexOf('private openAccount='),shell.indexOf('private openProductInfo='));
  const status=shell.slice(shell.indexOf('private syncStatus='),shell.indexOf('private conflictBanner='));
  assert.match(open,/requestSettingsScope\('account'\)/);
  assert.match(open,/this\.props\.onSettings\(\)/);
  assert.match(status,/return <div /);
  assert.match(status,/role="status" aria-live="polite"/);
  assert.doesNotMatch(status,/onClick|<button/i);
  assert.match(shell,/className="ta-topbar-account"[\s\S]*onClick=\{this\.openAccount\}/);
  assert.match(shell,/className="ta-sheet-account" onClick=\{this\.openAccount\}/);
  assert.match(shell,/this\.syncStatus\('ta-topbar-sync'\)/);
  assert.match(shell,/this\.syncStatus\('ta-sheet-sync'\)/);
});

test('duplicate email recovery changes mode to sign-in and offers password reset',async()=>{
  const modal=await read('src/components/CloudAccountModal.tsx');
  assert.match(modal,/existingInvoiceAccount=this\.state\.mode==='create'/);
  assert.match(modal,/mode:existingInvoiceAccount\?'signin'/);
  assert.match(modal,/A LOUREX Invoice account already exists for this email/);
  assert.match(modal,/Forgot password\?/);
  assert.match(modal,/Use your LOUREX Invoice account to continue\./);
  assert.match(modal,/Saving and backup are automatic\./);
});

test('Invoice Firebase identity is explicitly configured for the Invoice project, not export',async()=>{
  const [firebase,config,isolation]=await Promise.all([
    read('src/cloud/firebase.ts'),read('src/cloud/firebase-config.ts'),
    read('scripts/verify-deployment-isolation.mjs')
  ]);
  assert.match(firebase,/import \{ LOUREX_FIREBASE_CONFIG \} from '\.\/firebase-config\.js'/);
  assert.match(firebase,/const FIREBASE_CONFIG=LOUREX_FIREBASE_CONFIG/);
  assert.match(config,/authDomain:'lourex-invoice\.firebaseapp\.com'/);
  assert.match(config,/projectId:'lourex-invoice'/);
  assert.match(isolation,/lou-rex\.com/);
  assert.match(isolation,/www\.lou-rex\.com/);
  assert.match(isolation,/lourex-bf110a8a\.vercel\.app/);
});

test('mobile and desktop account/sync owners are loaded and scoped to the current TailAdmin shell',async()=>{
  const [html,header,shell]=await Promise.all([
    read('index.html'),
    read('src/styles/tailadmin-mobile-header-v322.css'),
    read('src/styles/tailadmin-shell-contract-v326.css')
  ]);
  assert.match(html,/tailadmin-cloud-account-v320\.css/);
  assert.match(html,/tailadmin-mobile-header-v322\.css/);
  assert.match(html,/tailadmin-shell-contract-v326\.css/);
  assert.match(header,/\.ta-topbar-sync/);
  assert.match(header,/\.ta-sheet-account/);
  assert.match(shell,/\.ta-sheet-account/);
  assert.match(shell,/\.ta-sheet-sync/);
});
