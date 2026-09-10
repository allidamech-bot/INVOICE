import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v188 signed-out startup cannot resume an unlocked workspace without the authenticated account',async()=>{
  const [index,session]=await Promise.all([
    read('src/app/index.tsx'),
    read('src/storage/session.ts')
  ]);
  assert.match(index,/currentCloudUser, waitForCloudUser/);
  assert.match(index,/async function resolveRequiredAccountSession/);
  assert.match(index,/if\(user\)\{[\s\S]*setActiveAccountUid\(user\.uid\);[\s\S]*await resumeAccountSession\(user\.uid\);[\s\S]*return true;[\s\S]*\}/);
  assert.match(index,/setActiveAccountUid\(null\);[\s\S]*await suspendSession\(\);[\s\S]*return false;/);
  assert.match(index,/const accountReady=await resolveRequiredAccountSession\(\)/);
  assert.match(index,/if\(accountReady\)await hydrateAuthoritativeCloudBeforeApp\(\)/);
  assert.match(session,/export async function suspendSession\(\):Promise<void>/);
  assert.doesNotMatch(session,/deleteRecord\('vault'\)|deleteRecord\('security'\)/);
});

test('v188 any Firebase account sign-out returns an unlocked workspace to the account gateway',async()=>{
  const index=await read('src/app/index.tsx');
  assert.match(index,/function startAccountSignOutWatcher\(\):void/);
  assert.match(index,/const user=currentCloudUser\(\)/);
  assert.match(index,/if\(user\)\{[\s\S]*setActiveAccountUid\(user\.uid\);[\s\S]*accountWasAuthenticated=true;[\s\S]*return;[\s\S]*\}/);
  assert.match(index,/if\(!accountWasAuthenticated\)return;/);
  assert.match(index,/setActiveAccountUid\(null\);[\s\S]*void suspendSession\(\)\.finally\(\(\)=>\{/);
  assert.match(index,/sessionStorage\.setItem\('lourex-auth-just-signed-out','1'\)/);
  assert.match(index,/window\.location\.reload\(\)/);
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
