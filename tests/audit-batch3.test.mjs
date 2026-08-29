import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('configured devices render their local vault before waiting for Firebase auth',async()=>{
  const app=await read('src/app/App.tsx');
  const initialize=app.slice(app.indexOf('private initialize=async'),app.indexOf('private initializeConfiguredCloud'));
  assert.ok(initialize.indexOf('await hasSecurity()')>=0);
  assert.ok(initialize.indexOf('resumeVaultSession()')>=0);
  assert.ok(initialize.indexOf('resumeVaultSession()')<initialize.indexOf('waitForCloudUser()'),'local trusted session must be attempted before cloud wait');
  assert.match(initialize,/loading:false,firstRun:false,unlocked:true/);
  assert.match(initialize,/void this\.initializeConfiguredCloud\(\)/);
});

test('newer remote revisions are reconciled instead of entering the push-only online path',async()=>{
  const [freshness,app]=await Promise.all([read('src/cloud/freshness.ts'),read('src/app/App.tsx')]);
  assert.match(freshness,/lourex-cloud-remote-newer/);
  assert.doesNotMatch(freshness,/dispatchEvent\(new Event\('online'\)\)/);
  assert.match(app,/handleRemoteCloudNewer=.*cloudSyncNow/);
  assert.match(app,/screen==='editor'/);
});

test('cloud freshness watcher is read-only and cannot bypass App account-link safety checks',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.doesNotMatch(freshness,/putCloudAccount/);
  assert.match(freshness,/const linked=await getCloudAccount\(\)/);
  assert.match(freshness,/if\(!linked\|\|linked\.uid!==user\.uid\)return/);
});

test('all Firebase sign-in entry points mark the just-signed-in restoration window',async()=>{
  const firebase=await read('src/cloud/firebase.ts');
  assert.match(firebase,/function markRecentAuth/);
  assert.match(firebase,/createCloudUser[\s\S]*markRecentAuth\(\);return user/);
  assert.match(firebase,/signInCloudUser[\s\S]*markRecentAuth\(\);return user/);
  assert.match(firebase,/recent\?10_000:5_000/);
});
