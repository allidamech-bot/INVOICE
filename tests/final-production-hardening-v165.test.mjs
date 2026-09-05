import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('settings and account dialogs always retain an exit path during slow operations',async()=>{
  const [settings,account,css]=await Promise.all([
    read('src/components/SettingsModal.tsx'),
    read('src/components/CloudAccountModal.tsx'),
    read('src/styles/settings-account-v163.css')
  ]);
  assert.match(settings,/private requestClose=\(\)=>\{if\(this\.hasUnsavedSettings\(\)\)/);
  assert.doesNotMatch(settings,/requestClose=\(\)=>\{if\(this\.state\.busy\|\|this\.state\.cleaningAssets\)return/);
  assert.match(account,/private requestClose=\(\)=>this\.props\.onClose\(\);/);
  assert.match(css,/@media\(max-width:720px\),\(max-height:520px\) and \(pointer:coarse\)/);
  assert.match(css,/\.app-ui \.modal-backdrop\{[\s\S]*height:100dvh!important[\s\S]*env\(safe-area-inset-top\)/);
  assert.match(css,/\.app-ui \.modal-header>\.icon-btn\{[\s\S]*width:44px!important[\s\S]*height:44px!important/);
});

test('settings sign out uses app auth state without wiping or reloading local data',async()=>{
  const [settings,app]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/app/App.tsx')]);
  const action=settings.slice(settings.indexOf('private signOutFromCloud=async'),settings.indexOf('private saveButton'));
  assert.match(action,/await this\.props\.onCloudSignOut\(\)/);
  assert.doesNotMatch(action,/clearSession|delete|remove|reload|putSecurityAndVault/i);
  assert.match(app,/cloudUser:null,cloudLinked:false,cloudSyncState:'local'/);
  assert.match(app,/cloudUser=\{this\.state\.cloudUser\}[\s\S]{0,120}onCloudSignOut=\{this\.cloudSignOut\}/);
});

test('cloud restore is explicit and cloud publication never installs behind the active UI',async()=>{
  const [account,cloud,app]=await Promise.all([
    read('src/components/CloudAccountModal.tsx'),
    read('src/cloud/firebase.ts'),
    read('src/app/App.tsx')
  ]);
  assert.match(account,/confirmRestore:boolean/);
  assert.match(account,/<ConfirmDialog open=\{this\.props\.open&&this\.state\.confirmRestore\}/);
  assert.match(account,/await this\.props\.onRestore\(\)/);
  const push=cloud.slice(cloud.indexOf('export async function pushLocalVaultToCloud'),cloud.indexOf('// Compatibility exports'));
  assert.doesNotMatch(push,/installCloudVault/);
  assert.match(push,/Promise<'same'\|'pushed'\|'remote-changed'>/);
  assert.match(push,/return 'remote-changed'/);
  assert.match(app,/private cloudReplaceBlocked=\(\)=>this\.state\.screen==='editor'\|\|this\.state\.settingsOpen\|\|this\.state\.cloudModal/);
  assert.match(app,/private cloudRestore=async\(\)=>\{[\s\S]*await this\.beginProtectedOperation\(\)[\s\S]*installCloudVault\(user\.uid,false\)[\s\S]*this\.endProtectedOperation\(\)/);
  assert.match(app,/cloudRemoteChangedSinceAnchor\(user\.uid\)/);
  assert.match(app,/if\(result==='remote-changed'\)\{[\s\S]*this\.deferRemoteCloud\(\)[\s\S]*this\.handleRemoteCloudNewer/);
  assert.doesNotMatch(app,/remote\.updatedAt\s*[<>]=?\s*local\.updatedAt/);
});

test('startup authority, trusted-session ordering and explicit PWA updates remain intact',async()=>{
  const [entry,startup,app,sw]=await Promise.all([
    read('src/app/index.tsx'),read('src/cloud/startup.ts'),read('src/app/App.tsx'),read('public/sw.js')
  ]);
  assert.match(entry,/await hydrateAuthoritativeCloudBeforeApp\(\)/);
  assert.ok(entry.indexOf('await hydrateAuthoritativeCloudBeforeApp()')<entry.indexOf('ReactDOM.render'));
  assert.match(startup,/waitForCloudUser\(\)/);
  assert.match(startup,/cloudRemoteChangedSinceAnchor\(user\.uid\)/);
  assert.match(startup,/installCloudVault\(user\.uid,false\)/);
  assert.match(app,/auth-cloud-launcher/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v167';$/m);
  assert.match(sw,/SKIP_WAITING/);
  assert.doesNotMatch(sw,/install[\s\S]{0,500}await self\.skipWaiting\(\)/);
});