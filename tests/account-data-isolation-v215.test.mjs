import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v215 Firestore remains strictly partitioned by authenticated Firebase UID',async()=>{
  const rules=await read('firestore.rules');
  assert.match(rules,/match \/users\/\{userId\}\/\{document=\*\*\}/);
  assert.match(rules,/request\.auth != null && request\.auth\.uid == userId/);
  assert.match(rules,/match \/\{document=\*\*\}[\s\S]*allow read, write: if false/);
});

test('v215 uses a physically distinct local IndexedDB database for every account UID',async()=>{
  const db=await read('src/storage/db.ts');
  assert.match(db,/const ACCOUNT_DB_PREFIX = 'lourex-invoice-account-'/);
  assert.match(db,/function accountDbName\(uid:string\):string\{return `\$\{ACCOUNT_DB_PREFIX\}\$\{encodeURIComponent\(uid\)\}`;\}/);
  assert.match(db,/function scopedDbName\(\):string\{return activeStorageUid\?accountDbName\(activeStorageUid\):PUBLIC_DB_NAME;\}/);
  assert.match(db,/export async function activateAccountStorage\(uid:string\|null\)/);
  assert.match(db,/indexedDB\.open\(name, DB_VERSION\)/);
});

test('v215 legacy migration adopts data only when the durable cloud-account owner matches the same UID',async()=>{
  const db=await read('src/storage/db.ts');
  assert.match(db,/const owner=await namedGet<CloudAccountRecord>\(legacy,'cloud-account'\)/);
  assert.match(db,/if\(!owner\|\|owner\.uid!==uid\)\{markMigrationHandled\(uid\);return;\}/);
  assert.match(db,/const ids:Array<DbRecord\['id'\]>=\['security','vault','public-preferences','session-key','cloud-account','safety-snapshot'\]/);
  assert.match(db,/await namedPutMany\(target,records\)/);
  assert.match(db,/MIGRATION_MARKER_PREFIX/);
});

test('v215 local cloud-account writes refuse a UID that differs from the selected local account scope',async()=>{
  const db=await read('src/storage/db.ts');
  assert.match(db,/if\(activeStorageUid&&activeStorageUid!==uid\)throw new Error\('Local account storage does not match the authenticated account\.'\)/);
  assert.match(db,/await putRecord\(\{id:'cloud-account',uid,email/);
});

test('v215 selects the UID storage boundary before any account session or cloud reconciliation',async()=>{
  const entry=await read('src/app/index.tsx');
  const resolve=entry.slice(entry.indexOf('async function resolveRequiredAccountSession'),entry.indexOf('function startAccountSignOutWatcher'));
  assert.ok(resolve.indexOf('setActiveAccountUid(user.uid)')>=0);
  assert.ok(resolve.indexOf('await activateAccountStorage(user.uid)')>resolve.indexOf('setActiveAccountUid(user.uid)'));
  assert.ok(resolve.indexOf('await resumeAccountSession(user.uid)')>resolve.indexOf('await activateAccountStorage(user.uid)'));
  assert.match(entry,/if\(accountReady\)await hydrateAuthoritativeCloudBeforeApp\(\)/);
});

test('v215 a changed Firebase UID safely suspends the original local vault before switching scopes',async()=>{
  const entry=await read('src/app/index.tsx');
  const app=await read('src/app/App.tsx');
  const watcher=entry.slice(entry.indexOf('function startAccountSignOutWatcher'),entry.indexOf('async function start()'));
  assert.match(watcher,/const selectedStorageUid=activeAccountStorageUid\(\);/);
  const changed=watcher.indexOf('if(selectedStorageUid&&selectedStorageUid!==user.uid)');
  const sameUser=watcher.indexOf('setActiveAccountUid(user.uid)',changed);
  assert.ok(changed>=0&&sameUser>changed);
  const dispatch=watcher.indexOf('lourex-account-transition-request',changed);
  assert.ok(dispatch>changed&&dispatch<sameUser,'changed identity requires a protected transition before entering same-user flow');
  const handler=app.slice(app.indexOf('private handleAccountTransitionRequest='),app.indexOf('private handleOnline='));
  const sequence=['await this.drainVaultWrites()','await this.waitForCloudIdle()','await suspendSession()',
    'setActiveAccountUid(uid)','await activateAccountStorage(uid)','this.latestEncryptedVault=null','key:null,vault:null'];
  let position=-1;
  for(const step of sequence){
    const next=handler.indexOf(step,position+1);
    assert.ok(next>position,'account replacement must complete protected step: '+step);
    position=next;
  }
  assert.match(handler,/await this\.initialize\(\)/);
  assert.match(handler,/lourex-account-transition-complete/);
});

test('v215 explicit account sign-out invalidates the PIN session before returning to the account gateway',async()=>{
  const modal=await read('src/components/CloudAccountModal.tsx');
  const signOut=modal.slice(modal.indexOf('private signOut=async'),modal.indexOf('private resolveConflict=async'));
  const auth=signOut.indexOf('await this.props.onSignOut()');
  const key=signOut.indexOf('await suspendSession()');
  const reload=signOut.indexOf('window.location.reload()');
  assert.ok(auth>=0&&key>auth&&reload>key,'the usable PIN session must be suspended before the sign-out reload');
  const entry=await read('src/app/index.tsx');
  const watcher=entry.slice(entry.indexOf('function startAccountSignOutWatcher'),entry.indexOf('async function start()'));
  assert.match(watcher,/if\(!accountWasAuthenticated\|\|signOutTransitionRunning\)return/);
  assert.match(watcher,/lourexCloudSessionLost/);
  assert.doesNotMatch(watcher,/await activateAccountStorage\(null\)/,
    'a transient Safari auth-null event must not migrate or delete the previous account vault');
});

test('v216 keeps installed clients on the account-isolated storage runtime while advancing the PWA generation',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v216'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v215'.*legacy marker/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v214'.*legacy marker/);
  assert.match(patch,/security-boundary migration/);
  assert.match(patch,/await self\.skipWaiting\(\)/);
});
