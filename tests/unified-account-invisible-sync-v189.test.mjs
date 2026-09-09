import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v189 fresh setup uses account-managed encryption without asking for a device PIN',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const setup=auth.slice(auth.indexOf('export class SetupScreen'),auth.indexOf('interface UnlockProps'));
  assert.match(setup,/getOrCreateAccountVaultSecret\(user\.uid\)/);
  assert.match(setup,/onFinish\(accountSecret, this\.state\.company\)/);
  assert.match(setup,/No separate access PIN is required/);
  assert.doesNotMatch(setup,/Create your LOUREX PIN/);
  assert.doesNotMatch(setup,/Confirm PIN/);
});

test('v189 account access secret is random, UID scoped and stored only below the authenticated user path',async()=>{
  const source=await read('src/cloud/account-access.ts');
  assert.match(source,/crypto\.getRandomValues\(bytes\)/);
  assert.match(source,/`acct_\$\{bytesToBase64Url\(bytes\)\}`/);
  assert.match(source,/collection\('users'\)\.doc\(uid\)\.collection\('account'\)\.doc\('vault-access'\)/);
  assert.match(source,/currentCloudUser\(\)/);
  assert.match(source,/user\.uid!==uid/);
  assert.match(source,/runTransaction/);
});

test('v189 legacy PIN vaults require a one-time migration, then use the account secret',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const unlock=auth.slice(auth.indexOf('export class UnlockScreen'));
  assert.match(unlock,/componentDidMount\(\):void\{void this\.unlockWithAccount\(\);\}/);
  assert.match(unlock,/await this\.props\.onUnlock\(secret\)/);
  assert.match(unlock,/await changePin\(this\.state\.legacyPin,secret\)/);
  assert.match(unlock,/Previous device PIN · one time only/);
  assert.match(unlock,/will not ask for it again/);
});

test('v189 session keys are bound to Firebase UID and suspended, not exposed, on sign-out',async()=>{
  const [session,index,modal]=await Promise.all([
    read('src/storage/session.ts'),read('src/app/index.tsx'),read('src/components/CloudAccountModal.tsx')
  ]);
  assert.match(session,/const ACCOUNT_TOKEN_PREFIX = 'acct:'/);
  assert.match(session,/resumeAccountSession\(uid:string\)/);
  assert.match(session,/record\.token\.startsWith\(accountPrefix\(uid\)\)/);
  const suspended=session.slice(session.indexOf('export async function suspendSession'),session.indexOf('export async function clearSession'));
  assert.doesNotMatch(suspended,/deleteRecord\('session-key'\)[^}]*$/);
  assert.match(index,/await resumeAccountSession\(user\.uid\)/);
  assert.match(index,/await suspendSession\(\)/);
  assert.match(modal,/await suspendSession\(\)/);
});

test('v189 daily workspace exposes only generic save state, not cloud controls',async()=>{
  const [shell,modal,css]=await Promise.all([
    read('src/components/AppShell.tsx'),read('src/components/CloudAccountModal.tsx'),read('src/styles/unified-account-v189.css')
  ]);
  assert.match(shell,/t\('Saving…','جارٍ الحفظ…'\)/);
  assert.match(shell,/t\('Saved','محفوظ'\)/);
  assert.match(shell,/t\('Offline','غير متصل'\)/);
  assert.doesNotMatch(shell,/t\('Cloud','السحابة'\)/);
  assert.doesNotMatch(shell,/t\('Syncing','مزامنة'\)/);
  assert.doesNotMatch(modal,/Restore from Cloud/);
  assert.match(modal,/No manual sync or separate cloud sign-in is required/);
  assert.match(css,/\.auth-shell>\.auth-cloud-launcher\{\s*display:none!important/);
  assert.match(css,/\.settings-tabs>button:nth-child\(4\)/);
  assert.match(css,/\.security-settings-page\{\s*display:none!important/);
});

test('v189 PWA publishes a fresh runtime with account access and unified account styles cached',async()=>{
  const sw=await read('public/sw.js');
  const html=await read('index.html');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v189';$/m);
  assert.match(sw,/lourex-invoice-v188: preserved as a legacy marker/);
  assert.ok(sw.includes("LOCAL_CORE.push('./styles/unified-account-v189.css')"));
  assert.ok(sw.includes("LOCAL_CORE.push('./src/cloud/account-access.js')"));
  assert.match(html,/account-cloud-separation-v186\.css[\s\S]*unified-account-v189\.css[\s\S]*document-premium-redesign-v141\.css/);
});

test('v189 account migration never deletes the encrypted vault or security records',async()=>{
  const [session,auth,db]=await Promise.all([
    read('src/storage/session.ts'),read('src/components/AuthScreens.tsx'),read('src/storage/db.ts')
  ]);
  assert.doesNotMatch(session,/deleteRecord\('vault'\)|deleteRecord\('security'\)/);
  const migration=auth.slice(auth.indexOf('private migrateLegacy'),auth.indexOf('render(): any'));
  assert.doesNotMatch(migration,/clearDatabase|deleteRecord/);
  assert.match(db,/putSecurityAndVault/);
});
