import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v302 fresh setup requires an explicit local PIN after account authentication',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const setup=auth.slice(auth.indexOf('export class SetupScreen'),auth.indexOf('interface UnlockProps'));
  assert.match(setup,/PIN_PATTERN/);
  assert.match(setup,/Confirm PIN/);
  assert.match(setup,/onFinish\(this\.state\.pin, this\.state\.company\)/);
  assert.match(setup,/Account \+ PIN protection/);
  assert.doesNotMatch(setup,/getOrCreateAccountVaultSecret\(user\.uid\)/);
  assert.doesNotMatch(setup,/No separate access PIN is required/);
});

test('v189 account access secret remains random, UID scoped and stored only below the authenticated user path for safe migration',async()=>{
  const source=await read('src/cloud/account-access.ts');
  assert.match(source,/crypto\.getRandomValues\(bytes\)/);
  assert.match(source,/`acct_\$\{bytesToBase64Url\(bytes\)\}`/);
  assert.match(source,/collection\('users'\)\.doc\(uid\)\.collection\('account'\)\.doc\('vault-access'\)/);
  assert.match(source,/currentCloudUser\(\)/);
  assert.match(source,/user\.uid!==uid/);
  assert.match(source,/runTransaction/);
});

test('v302 account-secret vaults require a one-time migration to a user PIN',async()=>{
  const auth=await read('src/components/AuthScreens.tsx');
  const unlock=auth.slice(auth.indexOf('export class UnlockScreen'));
  assert.match(unlock,/componentDidMount\(\):void\{void this\.detectSecurityMode\(\);\}/);
  assert.match(unlock,/getAccountVaultSecret\(user\.uid\)/);
  assert.match(unlock,/await verifyPin\(secret,security\)/);
  assert.match(unlock,/await changePin\(this\.accountSecret,pin\)/);
  assert.match(unlock,/await this\.props\.onUnlock\(pin\)/);
  assert.match(unlock,/Create your LOUREX PIN/);
  assert.match(unlock,/PIN required on every app start/);
  assert.doesNotMatch(unlock,/will not ask for it again/);
});

test('v302 persisted session keys never authorize a brand-new runtime without PIN',async()=>{
  const [session,index,modal]=await Promise.all([
    read('src/storage/session.ts'),read('src/app/index.tsx'),read('src/components/CloudAccountModal.tsx')
  ]);
  assert.match(session,/let runtimePinAuthorized=false/);
  assert.match(session,/establishSession[\s\S]*runtimePinAuthorized=true/);
  const resume=session.slice(session.indexOf('export async function resumeAccountSession'),session.indexOf('export function touchSession'));
  assert.match(resume,/runtimePinAuthorized=false/);
  assert.match(resume,/return false/);
  const getter=session.slice(session.indexOf('export async function getSessionKey'),session.indexOf('export async function suspendSession'));
  assert.match(getter,/if\(!runtimePinAuthorized\)return null/);
  const suspended=session.slice(session.indexOf('export async function suspendSession'),session.indexOf('export async function clearSession'));
  assert.match(suspended,/runtimePinAuthorized=false/);
  assert.match(suspended,/deleteRecord\('session-key'\)/);
  assert.match(index,/await resumeAccountSession\(user\.uid\)/);
  assert.match(index,/await suspendSession\(\)/);
  assert.match(modal,/await suspendSession\(\)/);
});

test('daily workspace exposes truthful passive save states and reserves controls for conflicts',async()=>{
  const [shell,modal,css]=await Promise.all([
    read('src/components/AppShell.tsx'),read('src/components/CloudAccountModal.tsx'),read('src/styles/unified-account-v189.css')
  ]);
  assert.match(shell,/this\.props\.cloudLabel/);
  assert.match(shell,/this\.props\.cloudMessage/);
  assert.match(shell,/cloudState==='conflict'/);
  assert.match(shell,/Resolve safely/);
  assert.doesNotMatch(modal,/Restore from Cloud/);
  assert.match(modal,/No manual sync or separate cloud sign-in is required/);
  assert.match(css,/\.auth-shell>\.auth-cloud-launcher\{\s*display:none!important/);
  assert.match(css,/\.settings-preferences-workspace \.settings-tabs>button:nth-child\(4\)\{\s*display:flex!important/);
  assert.match(css,/\.settings-preferences-workspace \.security-settings-page\{\s*display:block!important/);
  assert.doesNotMatch(css,/\.settings-tabs>button:nth-child\(4\),\s*\n\.app-ui \.security-settings-page\{\s*display:none!important/);
});

test('v189 account runtime remains cached as later PWA generations advance',async()=>{
  const sw=await read('public/sw.js');
  const html=await read('index.html');
  const versions=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  const current=Number(versions.at(-1)?.[1]);
  assert.ok(Number.isInteger(current)&&current>=196,'current immutable PWA generation must not regress below v196');
  assert.match(sw,/lourex-invoice-v193: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v192: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v191: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v188: preserved as a legacy marker/);
  assert.ok(sw.includes("LOCAL_CORE.push('./styles/unified-account-v189.css')"));
  assert.ok(sw.includes("LOCAL_CORE.push('./src/cloud/account-access.js')"));
  assert.match(html,/account-cloud-separation-v186\.css[\s\S]*unified-account-v189\.css[\s\S]*document-premium-redesign-v141\.css/);
});

test('v302 PIN migration never deletes the encrypted vault or security records',async()=>{
  const [session,auth,db]=await Promise.all([
    read('src/storage/session.ts'),read('src/components/AuthScreens.tsx'),read('src/storage/db.ts')
  ]);
  assert.doesNotMatch(session,/deleteRecord\('vault'\)|deleteRecord\('security'\)/);
  const migration=auth.slice(auth.indexOf('private detectSecurityMode'),auth.indexOf('private languageSwitch',auth.indexOf('export class UnlockScreen')));
  assert.doesNotMatch(migration,/clearDatabase|deleteRecord/);
  assert.match(migration,/verifyPin\(secret,security\)/);
  assert.match(auth,/changePin\(this\.accountSecret,pin\)/);
  assert.match(db,/putSecurityAndVault/);
});
