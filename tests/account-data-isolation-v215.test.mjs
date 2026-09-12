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
  assert.match(db,/Clear only the currently selected local account scope/);
});

test('v215 selects the UID storage boundary before any account session or cloud reconciliation',async()=>{
  const entry=await read('src/app/index.tsx');
  const resolve=entry.slice(entry.indexOf('async function resolveRequiredAccountSession'),entry.indexOf('function startAccountSignOutWatcher'));
  assert.ok(resolve.indexOf('setActiveAccountUid(user.uid)')>=0);
  assert.ok(resolve.indexOf('await activateAccountStorage(user.uid)')>resolve.indexOf('setActiveAccountUid(user.uid)'));
  assert.ok(resolve.indexOf('await resumeAccountSession(user.uid)')>resolve.indexOf('await activateAccountStorage(user.uid)'));
  assert.match(entry,/if\(accountReady\)await hydrateAuthoritativeCloudBeforeApp\(\)/);
});

test('v215 sign-out destroys the usable session key before leaving that account storage scope',async()=>{
  const entry=await read('src/app/index.tsx');
  const watcher=entry.slice(entry.indexOf('function startAccountSignOutWatcher'),entry.indexOf('async function start()'));
  const suspend=watcher.indexOf('await suspendSession()');
  const clearUid=watcher.indexOf('setActiveAccountUid(null)');
  const publicScope=watcher.indexOf('await activateAccountStorage(null)');
  assert.ok(suspend>=0&&clearUid>suspend&&publicScope>clearUid);
});

test('v215 forces installed clients onto the account-isolated storage runtime',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v215'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v214'.*legacy marker/);
  assert.match(patch,/security-boundary migration/);
  assert.match(patch,/await self\.skipWaiting\(\)/);
});
