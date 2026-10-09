import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v188 signed-out startup cannot resume an unlocked workspace without the authenticated account',async()=>{
  const [index,session]=await Promise.all([
    read('src/app/index.tsx'),
    read('src/storage/session.ts')
  ]);
  assert.match(index,/currentCloudUser,[^}]*waitForCloudUser/);
  assert.match(index,/async function resolveRequiredAccountSession/);
  assert.match(index,/if\(user\)\{[\s\S]*setActiveAccountUid\(user\.uid\);[\s\S]*await resumeAccountSession\(user\.uid\);[\s\S]*return true;[\s\S]*\}/);
  assert.match(index,/setActiveAccountUid\(null\);[\s\S]*await suspendSession\(\);[\s\S]*return false;/);
  assert.match(index,/const accountReady=await resolveRequiredAccountSession\(\)/);
  assert.match(index,/if\(accountReady\)await hydrateAuthoritativeCloudBeforeApp\(\)/);
  assert.match(session,/export async function suspendSession\(\):Promise<void>/);
  assert.doesNotMatch(session,/deleteRecord\('vault'\)|deleteRecord\('security'\)/);
});

test('v188 a confirmed Firebase sign-out locks the account after a Safari-safe grace window',async()=>{
  const [index,app,session]=await Promise.all([
    read('src/app/index.tsx'),read('src/app/App.tsx'),read('src/storage/session.ts')
  ]);
  const watcher=index.slice(index.indexOf('function startAccountSignOutWatcher'),index.indexOf('async function start()'));
  const transition=app.slice(app.indexOf('private handleAccountTransitionRequest'),app.indexOf('private handleOnline'));
  assert.match(watcher,/subscribeCloudUser\(user=>\{/);
  assert.match(watcher,/clearPendingAuthLoss\(\)/,'a recovered session cancels the pending loss');
  assert.match(watcher,/if\(!accountWasAuthenticated\|\|signOutTransitionRunning\|\|pendingAuthLossTimer!==undefined\)return;/);
  assert.match(watcher,/pendingAuthLossTimer=window\.setTimeout/);
  assert.match(watcher,/if\(currentCloudUser\(\)\|\|signOutTransitionRunning\)return;/);
  assert.match(watcher,/lourex-account-transition-request/);
  assert.match(watcher,/detail:\{uid:null\}/,'confirmed loss requests an actual sign-out');
  assert.match(transition,/await this\.drainVaultWrites\(\);[\s\S]*await this\.waitForCloudIdle\(\);[\s\S]*await suspendSession\(\);/);
  assert.match(transition,/setActiveAccountUid\(uid\);[\s\S]*await activateAccountStorage\(uid\);/);
  assert.match(transition,/unlocked:false,key:null,vault:null/);
  assert.match(session,/runtimePinAuthorized=false;[\s\S]*removeMarker\(\);[\s\S]*deleteRecord\('session-key'\)/);
  assert.match(index,/startAccountSignOutWatcher\(\);/);
});
test('v188 logout guard remains present in later immutable PWA generations',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/v188 account-required logout/);
  assert.match(sw,/lourex-invoice-v188: preserved as a legacy marker/);
  const versions=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  const current=Number(versions.at(-1)?.[1]);
  assert.ok(Number.isInteger(current)&&current>=196,'current immutable PWA generation must not regress below v196');
  assert.ok(sw.includes('./src/app/index.js'));
});
