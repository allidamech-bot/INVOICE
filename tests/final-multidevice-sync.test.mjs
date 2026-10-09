import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('a stale device never auto-installs newer cloud data into an active workspace',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const reconcile=cloud.slice(cloud.indexOf('export async function reconcileCloudVault'));
  assert.match(reconcile,/if\(!anchor\)return 'diverged'/);
  assert.match(reconcile,/if\(localChanged&&remoteChanged\)return 'diverged'/);
  assert.match(reconcile,/const startup=Boolean\(document\.querySelector\('\.loading-screen'\)\)&&!document\.querySelector\('\.app-ui,\.auth-page'\)/);
  assert.match(reconcile,/if\(remoteChanged\)\{\s*if\(!startup\)return 'diverged';\s*await installCloudVault\(uid\);return 'pulled';\s*\}/);
  assert.match(reconcile,/if\(!local&&remote\)\{\s*if\(!startup\)return 'diverged'/);
  assert.doesNotMatch(reconcile,/if\(!anchor\)\{await installCloudVault\(uid\);return 'pulled';\}/);
  const unlock=cloud.slice(cloud.indexOf('export async function refreshCloudVaultForUnlock'),cloud.indexOf('export async function reconcileCloudVault'));
  assert.match(unlock,/if\(!document\.querySelector\('\.ta-unlock-page'\)\)throw new Error/);
  assert.match(unlock,/if\(hash!==anchor\.cipherSha256\)return 'diverged'/);
  const push=cloud.slice(cloud.indexOf('export async function pushLocalVaultToCloud'),cloud.indexOf('// Compatibility exports'));
  assert.match(push,/if\(!anchor\)return 'remote-changed'/);
  assert.match(push,/if\(remoteChanged\)return 'remote-changed'/);
  assert.doesNotMatch(push,/installCloudVault/);
  assert.doesNotMatch(cloud,/Nothing was overwritten|Both copies are safe/);
});

test('cross-device realtime reports newer data without replacing an active vault or forcing navigation',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/subscribeCloudVaultChanges/);
  assert.match(freshness,/cloudRemoteChangedSinceAnchor/);
  assert.match(freshness,/remoteUpdateNotified=true;[\s\S]*lourex-cloud-refresh-available/);
  assert.match(freshness,/workspaceHasUnsavedChanges\(\)/);
  assert.match(freshness,/if\(appleMobileWebKit\(\)\)\{/);
  assert.match(freshness,/5_000/);
  assert.doesNotMatch(freshness,/await (?:reconcileCloudVault|installCloudVault)\(/);
  assert.doesNotMatch(freshness,/window\.location\.reload\(\)/);
});

test('live account workspace rejects remote fast-forward; locked or pre-mount session may pull',async()=>{
  const vm=await import('node:vm');
  const ts=await import('typescript');
  const cloud=await read('src/cloud/firebase.ts');
  const source=cloud.slice(cloud.indexOf('export async function reconcileCloudVault'));
  assert.ok(source.startsWith('export async function reconcileCloudVault('));
  const compiled=ts.default.transpileModule(source,{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022}}).outputText;
  let installs=0;
  let startup=false;
  const context={exports:{},APP_SCHEMA_VERSION:999,
    requireCurrentUid:uid=>assert.equal(uid,'account-A'),
    getEncryptedVault:async()=>({cipher:'local-cipher'}),
    getCloudVaultMeta:async()=>({revision:'cloud-new',cipherSha256:'cloud-hash',schemaVersion:1}),
    sha256:async()=> 'local-hash',
    readSyncAnchor:()=>({revision:'cloud-old',cipherSha256:'local-hash'}),
    document:{querySelector:selector=>selector==='.loading-screen'?(startup?{}:null):(startup?null:{})},
    installCloudVault:async()=>{installs++;return true;},
    writeSyncAnchor:()=>{throw new Error('must not overwrite anchor on remote change');}
  };
  vm.runInNewContext(compiled,context);
  assert.equal(await context.exports.reconcileCloudVault('account-A'),'diverged');
  assert.equal(installs,0,'mounted account must never silently overwrite encrypted local data');
  startup=true;
  assert.equal(await context.exports.reconcileCloudVault('account-A'),'pulled');
  assert.equal(installs,1,'safe pre-mount startup may install verified newer cloud data');
});

test('missing local account link is repaired for the already authenticated account',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/if\(!linked\)/);
  assert.match(freshness,/putCloudAccount\(user\.uid,user\.email\)/);
  assert.match(freshness,/linked\.uid!==user\.uid/);
});

test('account revisions never use wall clock time to choose a winner',async()=>{
  const [cloud,app]=await Promise.all([read('src/cloud/firebase.ts'),read('src/app/App.tsx')]);
  assert.doesNotMatch(cloud,/remote\.updatedAt\s*[<>]=?\s*local\.updatedAt/);
  assert.doesNotMatch(app,/remote\.updatedAt\s*[<>]=?\s*local\.updatedAt/);
  assert.match(app,/cloudRemoteChangedSinceAnchor\(user\.uid\)/);
  assert.match(cloud,/remote\.revision!==anchor\.revision/);
  assert.match(cloud,/commitMetaIfUnchanged/);
});

test('UI rehydrates after cloud layer fast-forwards a stale legacy push',async()=>{
  const entry=await read('src/app/index.tsx');
  const cloud=await read('src/cloud/firebase.ts');
  assert.match(cloud,/lourex-cloud-applied/);
  assert.match(entry,/addEventListener\('lourex-cloud-applied'/);
  assert.match(entry,/window\.location\.reload\(\)/);
});
