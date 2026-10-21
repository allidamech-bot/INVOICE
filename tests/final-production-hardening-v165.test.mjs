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
  assert.match(settings,/private requestClose=\(\)=>\{if\(this\.state\.busy\)\{this\.closeRequestedDuringBusy=true/);
  assert.match(settings,/if\(this\.hasUnsavedSettings\(\)\)\{this\.setState\(\{confirmClose:true\}\)/);
  assert.match(settings,/previousState\.busy&&!this\.state\.busy&&this\.closeRequestedDuringBusy/);
  assert.match(settings,/private discardAndClose=\(\)=>this\.setState\(\{confirmClose:false\},this\.props\.onClose\)/);
  assert.match(account,/private requestClose=\(\)=>this\.props\.onClose\(\);/);
  assert.match(css,/@media\(max-width:720px\),\(max-height:520px\) and \(pointer:coarse\)/);
  assert.match(css,/\.app-ui \.modal-backdrop\{[\s\S]*height:100dvh!important[\s\S]*env\(safe-area-inset-top\)/);
  assert.match(css,/\.app-ui \.modal-header>\.icon-btn\{[\s\S]*width:44px!important[\s\S]*height:44px!important/);
});

test('legacy settings sign out does not wipe encrypted local data',async()=>{
  const [settings,app]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/app/App.tsx')]);
  const action=settings.slice(settings.indexOf('private signOutFromCloud=async'),settings.indexOf('private saveButton'));
  assert.match(action,/await this\.props\.onCloudSignOut\(\)/);
  assert.doesNotMatch(action,/clearSession|delete|remove|reload|putSecurityAndVault/i);
  assert.match(app,/cloudUser:null,cloudLinked:false,cloudSyncState:'local'/);
  assert.match(app,/cloudUser=\{this\.state\.cloudUser\}[\s\S]{0,120}onCloudSignOut=\{this\.cloudSignOut\}/);
});

test('cloud recovery is explicit while automatic V2 publication remains loss-safe',async()=>{
  const [account,cloud,app,settings]=await Promise.all([
    read('src/components/CloudAccountModal.tsx'),read('src/cloud/plain-workspace.ts'),
    read('src/app/App.tsx'),read('src/components/SettingsModal.tsx')
  ]);
  assert.match(account,/confirmConflict:'keep-local'\|'use-cloud'\|''/);
  assert.match(settings,/confirmCloudRestore/);
  assert.match(settings,/await this\.props\.onCloudRestore\(\)/);
  assert.match(cloud,/Promise<'same'\|'pushed'\|'remote-changed'>/);
  assert.match(cloud,/return 'remote-changed'/);
  assert.match(cloud,/runTransaction\(async\(tx:any\)=>/);
  assert.match(cloud,/replacePlainWorkspaceIfUnchanged\(uid,local\.localRevision,replacement,'replaced-by-cloud',result\.protection\?\?undefined\)/);
  assert.match(app,/private cloudReplaceBlocked=\(\)=>this\.state\.screen==='editor'\|\|this\.state\.settingsOpen\|\|this\.state\.cloudModal/);
  const restore=app.slice(app.indexOf('private cloudRestore=async'),app.indexOf('private keepLocalCloudCopy=async'));
  assert.match(restore,/await this\.beginProtectedOperation\(\)/);
  assert.match(restore,/downloadPlainCloudWorkspace\(uid\)/);
  assert.match(restore,/this\.endProtectedOperation\(\)/);
  assert.doesNotMatch(app,/remote\.updatedAt\s*[<>]=?\s*local\.updatedAt/);
});

test('Firebase UID bootstrap and explicit PWA updates preserve safe ordering without the old PIN vault',async()=>{
  const [entry,app,sw]=await Promise.all([
    read('src/app/index.tsx'),read('src/app/App.tsx'),read('public/sw.js')
  ]);
  assert.match(entry,/const accountReady=await resolveRequiredAccountSession\(\)/);
  assert.match(entry,/ReactDOM\.render\(<AppErrorBoundary><App\/><\/AppErrorBoundary>/);
  assert.match(entry,/await activateAccountStorage\(user\.uid\)/);
  assert.doesNotMatch(entry,/hydrateAuthoritativeCloudBeforeApp\(/);
  assert.match(app,/waitForCloudUser\(\)/);
  assert.match(app,/reconcilePlainCloudWorkspace\(user\.uid\)/);
  assert.match(app,/auth-cloud-launcher/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v315';$/m);
  assert.match(sw,/SKIP_WAITING/);
  assert.doesNotMatch(sw,/install[\s\S]{0,500}await self\.skipWaiting\(\)/);
});
