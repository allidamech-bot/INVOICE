import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync(new URL('../src/components/AppShell.tsx',import.meta.url),'utf8');
const modal=fs.readFileSync(new URL('../src/components/CloudAccountModal.tsx',import.meta.url),'utf8');
const firebase=fs.readFileSync(new URL('../src/cloud/firebase.ts',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../src/cloud/firebase-config.ts',import.meta.url),'utf8');
const isolation=fs.readFileSync(new URL('../scripts/verify-deployment-isolation.mjs',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles/tailadmin-shell-v320.css',import.meta.url),'utf8');
const accountCss=fs.readFileSync(new URL('../src/styles/tailadmin-cloud-account-v320.css',import.meta.url),'utf8');

test('account actions remain independent from passive cloud status across desktop and mobile',()=>{
  assert.match(shell,/private openAccount=\(\)=>\{[\s\S]*this\.requestSettingsScope\('account'\);[\s\S]*this\.props\.onSettings\(\)/);
  assert.match(shell,/private syncStatus=\(className:string\)=>\{[\s\S]*role="status" aria-live="polite"/);
  assert.match(shell,/this\.syncStatus\('ta-sidebar-sync'\)/);
  assert.match(shell,/this\.syncStatus\('ta-topbar-sync'\)/);
  assert.match(shell,/this\.syncStatus\('ta-sheet-sync'\)/);
  assert.match(shell,/className="ta-sidebar-account" onClick=\{this\.openAccount\}/);
  assert.match(shell,/className="ta-topbar-account" aria-label=\{t\('My Account','حسابي'\)\} onClick=\{this\.openAccount\}/);
  assert.doesNotMatch(shell,/ta-(?:sidebar|topbar|sheet)-sync[^>]*onClick=\{this\.props\.onCloud\}/);
  assert.doesNotMatch(shell,/Account & cloud|الحساب والسحابة/);
});

test('existing email recovery safely returns to sign in, exposes reset and explains automatic backup',()=>{
  assert.match(modal,/const existingInvoiceAccount=this\.state\.mode==='create'&&\/already has a LOUREX account\/i\.test\(error\)/);
  assert.match(modal,/mode:existingInvoiceAccount\?'signin':this\.state\.mode/);
  assert.match(modal,/password:existingInvoiceAccount\?'':this\.state\.password/);
  assert.match(modal,/A LOUREX Invoice account already exists for this email/);
  assert.match(modal,/Forgot password/);
  assert.match(modal,/Use your LOUREX Invoice account to continue\. Saving and backup are automatic\./);
  assert.match(modal,/role="alert"/);
  assert.match(modal,/aria-busy=\{this\.state\.busy\}/);
});

test('invoice authentication remains bound to its own Firebase project and deployment isolation',()=>{
  assert.match(firebase,/import \{ LOUREX_FIREBASE_CONFIG \} from '\.\/firebase-config\.js'/);
  assert.match(config,/authDomain:'lourex-invoice\.firebaseapp\.com'/);
  assert.match(config,/projectId:'lourex-invoice'/);
  assert.match(isolation,/lou-rex\.com/);
  assert.match(isolation,/www\.lou-rex\.com/);
  assert.match(isolation,/lourex-bf110a8a\.vercel\.app/);
});

test('current shell and account styles are loaded and retain distinct touch targets',()=>{
  assert.match(index,/tailadmin-shell-v320\.css/);
  assert.match(index,/tailadmin-cloud-account-v320\.css/);
  assert.match(css,/\.app-ui \.ta-topbar-account/);
  assert.match(css,/\.app-ui \.ta-sidebar-account/);
  assert.match(css,/\.app-ui \.ta-topbar-sync/);
  assert.match(accountCss,/\.ta-cloud-account/);
  assert.match(accountCss,/\.ta-cloud-auth-form/);
  assert.doesNotMatch(index,/account-cloud-separation-v186\.css/);
});
