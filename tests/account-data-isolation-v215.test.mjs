import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

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

test('v215 cloud-account writes are executable and deny public and cross-account storage',async()=>{
  const db=await read('src/storage/db.ts');
  const from=db.indexOf('export async function putCloudAccount(');
  const until=db.indexOf('export async function clearCloudAccount()',from);
  const implementation=db.slice(from,until);
  assert.ok(from>=0&&until>from,'exercise the actual production persistence function');
  const compiled=ts.transpileModule(implementation,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
  }}).outputText;
  for(const selectedUid of [null,'other-account','my-account']){
    const writes=[];
    const context={exports:{},activeStorageUid:selectedUid,
      getCloudAccount:async()=>null,putRecord:async record=>writes.push(record)};
    vm.runInNewContext(compiled,context);
    const attempt=context.exports.putCloudAccount('my-account','user@example.test');
    if(selectedUid==='my-account'){
      await attempt;
      assert.equal(writes.length,1,'matching UID can persist its own account metadata');
      assert.equal(writes[0].uid,'my-account');
    }else{
      await assert.rejects(attempt,/Local account storage does not match the authenticated account/);
      assert.deepEqual(writes,[], 'public DB and other UID may never receive account ownership data');
    }
  }
});

test('v215 selects the UID storage boundary before any account session or cloud reconciliation',async()=>{
  const entry=await read('src/app/index.tsx');
  const resolve=entry.slice(entry.indexOf('async function resolveRequiredAccountSession'),entry.indexOf('function startAccountSignOutWatcher'));
  assert.ok(resolve.indexOf('setActiveAccountUid(user.uid)')>=0);
  assert.ok(resolve.indexOf('await activateAccountStorage(user.uid)')>resolve.indexOf('setActiveAccountUid(user.uid)'));
  assert.ok(resolve.indexOf('await resumeAccountSession(user.uid)')>resolve.indexOf('await activateAccountStorage(user.uid)'));
  assert.match(entry,/if\(accountReady\)await hydrateAuthoritativeCloudBeforeApp\(\)/);
});

test('v215 direct UID replacement goes through a guarded account transition before exposing new data',async()=>{
  const [index,app]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx')]);
  const watcher=index.slice(index.indexOf('function startAccountSignOutWatcher'),index.indexOf('async function start()'));
  const transition=app.slice(app.indexOf('private handleAccountTransitionRequest'),app.indexOf('private handleOnline'));
  assert.match(watcher,/const selectedStorageUid=activeAccountStorageUid\(\)/);
  assert.match(watcher,/if\(selectedStorageUid!==user\.uid\)/);
  assert.doesNotMatch(watcher,/if\(!selectedStorageUid\)\{[\s\S]*?await activateAccountStorage\(user\.uid\)/,'late login must not swap IndexedDB without reinitializing React');
  assert.match(watcher,/lourex-account-transition-request/);
  assert.match(watcher,/detail:\{uid:targetUid\}/);
  assert.match(transition,/await this\.drainVaultWrites\(\);[\s\S]*await this\.waitForCloudIdle\(\);/);
  assert.match(transition,/await suspendSession\(\);[\s\S]*setActiveAccountUid\(uid\);[\s\S]*await activateAccountStorage\(uid\);/);
  assert.match(transition,/this\.latestEncryptedVault=null;/);
  assert.match(transition,/unlocked:false,key:null,vault:null/);
  assert.doesNotMatch(transition,/resumeAccountSession\(uid\)/,'account switching must not inherit an unlocked PIN session');
});

test('v215 confirmed sign-out revokes the old account session before selecting the public scope',async()=>{
  const [index,app]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx')]);
  const watcher=index.slice(index.indexOf('function startAccountSignOutWatcher'),index.indexOf('async function start()'));
  const transition=app.slice(app.indexOf('private handleAccountTransitionRequest'),app.indexOf('private handleOnline'));
  assert.match(watcher,/if\(currentCloudUser\(\)\|\|signOutTransitionRunning\)return;/);
  assert.match(watcher,/detail:\{uid:null\}/);
  assert.match(transition,/requested===null\?null:String\(requested\)\.trim\(\)/);
  assert.match(transition,/await suspendSession\(\);[\s\S]*setActiveAccountUid\(uid\);[\s\S]*await activateAccountStorage\(uid\);/);
  assert.match(transition,/this\.setState\(\{loading:false,unlocked:false,key:null,vault:null/,'failed scope transition must fail closed');
});

test('v216 keeps installed clients on the account-isolated storage runtime while advancing the PWA generation',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v216'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v215'.*legacy marker/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v214'.*legacy marker/);
  assert.match(patch,/security-boundary migration/);
  assert.match(patch,/await self\.skipWaiting\(\)/);
});
