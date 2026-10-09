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

test('v215 cloud-account writes require an exact authenticated UID storage scope, never the public database',async()=>{
  const db=await read('src/storage/db.ts');
  const source=db.slice(db.indexOf('export async function putCloudAccount('),db.indexOf('export async function clearCloudAccount()'));
  assert.ok(source.startsWith('export async function putCloudAccount('),'exercise actual production persistence function');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  for(const selectedUid of [null,'other-account','my-account']){
    const writes=[];
    const context={exports:{},activeStorageUid:selectedUid,
      getCloudAccount:async()=>null,putRecord:async record=>writes.push(record)};
    vm.runInNewContext(compiled,context);
    const attempt=context.exports.putCloudAccount('my-account','user@example.test');
    if(selectedUid==='my-account'){
      await attempt;
      assert.equal(writes.length,1);
      assert.equal(writes[0].uid,'my-account');
    }else{
      await assert.rejects(attempt,/Local account storage does not match the authenticated account/);
      assert.deepEqual(writes,[],'must not write a cross-account or public-scoped cloud owner');
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

test('v215 changing Firebase UID uses the coordinated old-key revocation and DB switch',async()=>{
  const [entry,app]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx')]);
  const watcher=entry.slice(entry.indexOf('function startAccountSignOutWatcher'),entry.indexOf('async function start()'));
  const handler=app.slice(app.indexOf('private handleAccountTransitionRequest='),app.indexOf('private handleOnline='));
  assert.match(watcher,/const selectedStorageUid=activeAccountStorageUid\(\)/);
  assert.match(watcher,/if\(selectedStorageUid&&selectedStorageUid!==user\.uid\)/);
  assert.match(watcher,/lourex-account-transition-request[\s\S]*uid:targetUid/);
  const drain=handler.indexOf('await this.drainVaultWrites()');
  const idle=handler.indexOf('await this.waitForCloudIdle()');
  const suspend=handler.indexOf('await suspendSession()');
  const changeOwner=handler.indexOf('setActiveAccountUid(uid||null)');
  const changeDb=handler.indexOf('await activateAccountStorage(uid||null)');
  const clearView=handler.indexOf('unlocked:false,key:null,vault:null');
  assert.ok(drain>=0&&idle>drain&&suspend>idle&&changeOwner>suspend&&changeDb>changeOwner&&clearView>changeDb,
    'existing account must be drained, revoked and removed from React state before replacing the UID');
  assert.doesNotMatch(watcher,/resumeAccountSession\(user\.uid\)/);
});

test('v215 persistent sign-out revokes the PIN key before clearing the account scope',async()=>{
  const [entry,app]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx')]);
  const watcher=entry.slice(entry.indexOf('function startAccountSignOutWatcher'),entry.indexOf('async function start()'));
  const handler=app.slice(app.indexOf('private handleAccountTransitionRequest='),app.indexOf('private handleOnline='));
  assert.match(watcher,/if\(!accountWasAuthenticated\|\|signOutTransitionRunning\|\|currentCloudUser\(\)\)return/);
  assert.match(watcher,/detail:\{uid:'',signedOut:true\}/);
  assert.match(handler,/const signedOut=detail\?\.signedOut===true/);
  const suspend=handler.indexOf('await suspendSession()');
  const clearOwner=handler.indexOf('setActiveAccountUid(uid||null)');
  const clearStorage=handler.indexOf('await activateAccountStorage(uid||null)');
  assert.ok(suspend>=0&&clearOwner>suspend&&clearStorage>clearOwner);
  assert.match(handler,/if\(signedOut\)\{[\s\S]*await suspendSession\(\);[\s\S]*setActiveAccountUid\(null\);[\s\S]*window\.location\.reload\(\)/);
});

test('v216 keeps installed clients on the account-isolated storage runtime while advancing the PWA generation',async()=>{
  const patch=await read('scripts/pwa-cache-v205.mjs');
  assert.match(patch,/const CACHE = 'lourex-invoice-v216'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v215'.*legacy marker/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v214'.*legacy marker/);
  assert.match(patch,/security-boundary migration/);
  assert.match(patch,/await self\.skipWaiting\(\)/);
});
