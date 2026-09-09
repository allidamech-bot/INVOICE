import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v188 signed-out startup cannot resume an old unlocked local session',async()=>{
  const [index,session]=await Promise.all([
    read('src/app/index.tsx'),
    read('src/storage/session.ts')
  ]);
  assert.match(index,/currentCloudUser, waitForCloudUser/);
  assert.match(index,/async function resolveRequiredAccountSession/);
  assert.match(index,/if\(user\)return true;[\s\S]*await clearSession\(\);[\s\S]*return false;/);
  assert.match(index,/const accountReady=await resolveRequiredAccountSession\(\)/);
  assert.match(index,/if\(accountReady\)await hydrateAuthoritativeCloudBeforeApp\(\)/);
  assert.match(session,/export async function clearSession\(\):Promise<void>/);
  assert.doesNotMatch(session,/deleteRecord\('vault'\)|deleteRecord\('security'\)/);
});

test('v188 any Firebase account sign-out returns an unlocked workspace to the account gateway',async()=>{
  const index=await read('src/app/index.tsx');
  assert.match(index,/function startAccountSignOutWatcher\(\):void/);
  assert.match(index,/const signedIn=Boolean\(currentCloudUser\(\)\)/);
  assert.match(index,/if\(signedIn\)\{accountWasAuthenticated=true;return;\}/);
  assert.match(index,/if\(!accountWasAuthenticated\)return;/);
  assert.match(index,/void clearSession\(\)\.finally\(\(\)=>\{/);
  assert.match(index,/sessionStorage\.setItem\('lourex-auth-just-signed-out','1'\)/);
  assert.match(index,/window\.location\.reload\(\)/);
  assert.match(index,/startAccountSignOutWatcher\(\);/);
});
