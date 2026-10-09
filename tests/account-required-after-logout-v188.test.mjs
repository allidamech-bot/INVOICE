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

test('v188 confirmed Firebase sign-out closes the encrypted workspace and returns to the account gateway',async()=>{
  const [index,app]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx')]);
  const watcher=index.slice(index.indexOf('function startAccountSignOutWatcher'),index.indexOf('async function start()'));
  const handler=app.slice(app.indexOf('private handleAccountTransitionRequest='),app.indexOf('private handleOnline='));
  assert.match(watcher,/subscribeCloudUser\(user=>\{/);
  assert.match(watcher,/if\(signOutConfirmTimer!==undefined\)\{window\.clearTimeout\(signOutConfirmTimer\)/);
  assert.match(watcher,/signOutConfirmTimer=window\.setTimeout\(\(\)=>\{/);
  assert.match(watcher,/if\(!accountWasAuthenticated\|\|signOutTransitionRunning\|\|currentCloudUser\(\)\)return/);
  assert.match(watcher,/lourex-account-transition-request[\s\S]*signedOut:true/);
  assert.doesNotMatch(watcher,/setInterval/);
  assert.match(handler,/const signedOut=detail\?\.signedOut===true/);
  assert.match(handler,/await suspendSession\(\);[\s\S]*setActiveAccountUid\(uid\|\|null\);[\s\S]*await activateAccountStorage\(uid\|\|null\)/);
  assert.match(handler,/if\(signedOut\)\{[\s\S]*await suspendSession\(\);[\s\S]*setActiveAccountUid\(null\);[\s\S]*window\.location\.reload\(\)/);
  // Confirmed loss must revoke the previous session even if saving or IndexedDB fails.
  assert.match(handler,/finally\{[\s\S]*if\(signedOut\)\{[\s\S]*await suspendSession\(\)/);
  assert.match(handler,/if\(signedOut\)\{[\s\S]*window\.location\.reload\(\)/);
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
