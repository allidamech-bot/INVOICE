import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync(new URL('../src/components/AppShell.tsx',import.meta.url),'utf8');
const modal=fs.readFileSync(new URL('../src/components/CloudAccountModal.tsx',import.meta.url),'utf8');
const firebase=fs.readFileSync(new URL('../src/cloud/firebase.ts',import.meta.url),'utf8');
const firebaseConfig=fs.readFileSync(new URL('../src/cloud/firebase-config.ts',import.meta.url),'utf8');
const isolation=fs.readFileSync(new URL('../scripts/verify-deployment-isolation.mjs',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles/account-cloud-separation-v186.css',import.meta.url),'utf8');

test('account action is separate from background save status in the application shell',()=>{
  assert.match(shell,/className="ta-sidebar-account" onClick=\{this\.openAccount\}/,'desktop account entry must remain a standalone action');
  assert.match(shell,/className="ta-topbar-account" aria-label=\{t\('My Account'/,'top bar must expose a labelled account button');
  assert.match(shell,/className="ta-sheet-account" onClick=\{this\.openAccount\}/,'mobile More must expose account settings');
  assert.match(shell,/role="status" aria-live="polite"/,'background cloud save state must remain non-interactive');
  assert.doesNotMatch(shell,/Account & cloud|الحساب والسحابة/);
  assert.doesNotMatch(shell,/role="status"[^\n]*onClick=\{this\.props\.onCloud\}/,'save status cannot be mistaken for account navigation');
});

test('existing-email recovery identifies the LOUREX Invoice account and switches back to sign in',()=>{
  assert.match(modal,/A LOUREX Invoice account already exists for this email/);
  assert.match(modal,/existingInvoiceAccount\?'signin'/);
  assert.match(modal,/Forgot password/);
  assert.match(modal,/Use your LOUREX Invoice account to continue to your workspace/);
  assert.match(modal,/Saving and backup are automatic/);
});

test('invoice authentication remains isolated from the export site',()=>{
  assert.match(firebase,/LOUREX_FIREBASE_CONFIG/,'auth runtime must use the dedicated invoice Firebase config');
  assert.match(firebaseConfig,/authDomain:'lourex-invoice\.firebaseapp\.com'/);
  assert.match(firebaseConfig,/projectId:'lourex-invoice'/);
  assert.match(isolation,/lou-rex\.com/);
  assert.match(isolation,/www\.lou-rex\.com/);
  assert.match(isolation,/lourex-bf110a8a\.vercel\.app/);
});

test('account separation styles are loaded after the legacy mobile layers',()=>{
  assert.match(index,/tailadmin-shell-v320\.css/,'the active shell owner must be deployed');
  assert.doesNotMatch(index,/account-cloud-separation-v186\.css/,'obsolete visual layer must not re-enter the live cascade');
  assert.match(css,/\.shell-topbar-actions/);
  assert.match(css,/\.shell-account-button/);
  assert.match(css,/\.cloud-account-scope-note/);
});