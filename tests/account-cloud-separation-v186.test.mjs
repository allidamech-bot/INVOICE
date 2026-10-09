import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('account actions are actionable separately from read-only cloud save indicators',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  const status=shell.slice(shell.indexOf('private syncStatus='),shell.indexOf('private conflictBanner='));
  assert.match(status,/role="status"/);
  assert.match(status,/aria-live="polite"/);
  assert.doesNotMatch(status,/onClick=/,'status must never act like an account or sync button');
  assert.match(shell,/this\.syncStatus\('ta-topbar-sync'\)/);
  assert.match(shell,/className="ta-topbar-account"[\s\S]{0,130}onClick=\{this\.openAccount\}/);
  assert.match(shell,/this\.syncStatus\('ta-sidebar-sync'\)/);
  assert.match(shell,/className="ta-sidebar-account" onClick=\{this\.openAccount\}/);
  assert.match(shell,/this\.syncStatus\('ta-sheet-sync'\)/);
  assert.match(shell,/className="ta-sheet-account" onClick=\{this\.openAccount\}/);
});

test('password reset is account-enumeration resistant and never reveals whether an email exists',async()=>{
  const modal=await read('src/components/CloudAccountModal.tsx');
  const reset=modal.slice(modal.indexOf('private reset='),modal.indexOf('private signOut='));
  assert.match(reset,/If an account exists for this email, password reset instructions will be sent/);
  assert.match(reset,/await this\.props\.onReset\(email\)/);
  assert.match(reset,/code\.includes\('user-not-found'\)/);
  assert.match(modal,/Forgot password/);
  assert.doesNotMatch(reset,/A LOUREX Invoice account already exists for this email/,
    'reset should not expose account existence');
});

test('Firebase identity and deployed frontend are isolated from the unrelated export site',async()=>{
  const [config,isolation]=await Promise.all([read('src/cloud/firebase-config.ts'),read('scripts/verify-deployment-isolation.mjs')]);
  assert.match(config,/authDomain:'lourex-invoice\.firebaseapp\.com'/);
  assert.match(config,/projectId:'lourex-invoice'/);
  assert.match(isolation,/EXPECTED_REPO_OWNER='allidamech-bot'/);
  assert.match(isolation,/EXPECTED_REPO_SLUG='INVOICE'/);
  assert.match(isolation,/lou-rex\.com/);
  assert.match(isolation,/www\.lou-rex\.com/);
  assert.match(isolation,/lourex-bf110a8a\.vercel\.app/);
});

test('current account and conflict styles are part of the loaded app-only visual layer',async()=>{
  const [html,css,shell]=await Promise.all([read('index.html'),read('src/styles/tailadmin-cloud-account-v320.css'),read('src/components/AppShell.tsx')]);
  assert.match(html,/styles\/tailadmin-cloud-account-v320\.css/);
  assert.match(css,/@media screen/);
  assert.match(css,/\.ta-cloud-account/);
  assert.match(css,/\.ta-cloud-conflict/);
  assert.match(shell,/className="ta-topbar-account"/);
  assert.match(shell,/this\.syncStatus\('ta-topbar-sync'\)/);
});
