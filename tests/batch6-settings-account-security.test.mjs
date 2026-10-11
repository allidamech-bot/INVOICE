import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('batch 6 keeps the canonical modal close control reachable on iPhone',async()=>{
  const [ui,css]=await Promise.all([read('src/components/UI.tsx'),read('src/styles/settings-account-v163.css')]);
  assert.match(ui,/IconButton icon="x" label=\{t\('Close','إغلاق'\)\} onClick=\{onClose\}/);
  const mobile=css.slice(css.indexOf('@media(max-width:720px)'));
  assert.match(mobile,/\.app-ui \.modal-backdrop\{[\s\S]*env\(safe-area-inset-top\)[\s\S]*overflow:hidden!important/);
  assert.match(mobile,/\.app-ui \.modal\{[\s\S]*display:flex!important[\s\S]*overflow:hidden!important/);
  assert.match(mobile,/\.app-ui \.modal-header\{[\s\S]*z-index:50!important[\s\S]*overflow:visible!important/);
  assert.match(mobile,/\.app-ui \.modal-header>\.icon-btn\{[\s\S]*width:44px!important[\s\S]*visibility:visible!important[\s\S]*pointer-events:auto!important/);
  assert.match(mobile,/\.app-ui \.modal-body\{[\s\S]*flex:1 1 0!important[\s\S]*overflow-y:auto!important/);
});

test('batch 6 supports authenticated sign out without deleting either local cache or legacy encrypted records',async()=>{
  const [settings,app,shell]=await Promise.all([
    read('src/components/SettingsModal.tsx'),read('src/app/App.tsx'),read('src/components/AppShell.tsx')
  ]);
  assert.match(settings,/onCloudSignOut:\(\)=>Promise<void>/);
  assert.match(settings,/private signOutFromCloud=async/);
  assert.match(settings,/This device keeps an offline cache for the same account/);
  const signOut=settings.slice(settings.indexOf('private signOutFromCloud=async'),settings.indexOf('private saveButton'));
  assert.match(signOut,/await this\.props\.onCloudSignOut\(\)/);
  assert.doesNotMatch(signOut,/deleteDatabase|deleteRecord|installCloudVault|restoreVault|putCloudAccount/);
  const appSignOut=app.slice(app.indexOf('private cloudSignOut=async'),app.indexOf('private cloudSyncNow=async'));
  assert.match(appSignOut,/await signOutCloudUser\(\)/);
  assert.match(appSignOut,/cloudUser:null,cloudLinked:false,firstRun:true,unlocked:false,vault:null/);
  assert.match(shell,/private signOutFromMore=async/);
  assert.match(shell,/await signOutCloudUser\(\)/);
  assert.match(shell,/await clearSession\(\)/);
  assert.match(shell,/\{signedIn\?<button type="button" className="ta-sheet-signout"/);
  assert.match(shell,/if\(this\.state\.signingOut\)return/);
  const more=shell.slice(shell.indexOf('private signOutFromMore=async'),shell.indexOf('private activeEditorDocument='));
  const auth=more.indexOf('await signOutCloudUser()');
  const revoke=more.indexOf('await clearSession()');
  const redirect=more.indexOf('window.location.replace(window.location.href)');
  assert.ok(auth>=0&&revoke>auth&&redirect>revoke,'sign-out removes Firebase auth before switching gateway');
  assert.doesNotMatch(more,/deleteDatabase|deleteRecord\('vault'\)|putSecurityAndVault/);
});

test('batch 6 exposes automatic Firebase account security, optional recovery, and no PIN lock',async()=>{
  const [settings,app]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/app/App.tsx')]);
  assert.match(settings,/Sign in using Google or your email and password/);
  assert.match(settings,/confirmCloudRestore/);
  assert.match(settings,/Restore account data from cloud\?/);
  assert.match(settings,/await this\.props\.onCloudRestore\(\)/);
  assert.match(app,/downloadPlainCloudWorkspace\(uid\)/);
  assert.match(settings,/The signed-in Firebase account copy will replace the local cache/);
  assert.doesNotMatch(settings,/Auto Lock|Lock Now|Device PIN|Change PIN|onLock:\(\)=>/);
  assert.match(app,/private lock=\(\)=>\{\}/);
});
test('batch 6 settings navigation is responsive and visually bounded',async()=>{
  const css=await read('src/styles/settings-account-v163.css');
  assert.match(css,/settings-workspace-v2/);
  assert.match(css,/grid-template-columns:196px minmax\(0,1fr\)!important/);
  assert.match(css,/\.settings-workspace-v2 \.settings-panel\{[\s\S]*overflow-y:auto!important/);
  const mobile=css.slice(css.indexOf('@media(max-width:720px)'));
  assert.match(mobile,/\.settings-workspace-v2 \.settings-tabs\{[\s\S]*flex-direction:row!important[\s\S]*overflow-x:auto!important/);
  assert.match(mobile,/\.settings-workspace-v2 \.form-grid\.two\{grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(mobile,/font-size:16px!important/);
});

test('batch 6 settings ship inside the canonical offline application stylesheet without changing A4 output',async()=>{
  const [html,sw,build,settings,live]=await Promise.all([
    read('index.html'),read('public/sw.js'),read('scripts/build.mjs'),
    read('src/styles/settings-account-v163.css'),read('src/styles/tailadmin-settings-v320.css')
  ]);
  assert.match(html,/href="\.\/styles\/tailadmin-settings-v320\.css/);
  assert.match(html,/href="\.\/styles\/tailadmin-shell-v320\.css/);
  assert.match(html,/href="\.\/styles\/tailadmin-reliability-bridge-v320\.css/);
  assert.match(build,/const appBundleCss=styleParts\.join/);
  assert.match(build,/await writeFile\('dist\/styles\/app\.bundle\.css',appBundleCss\)/);
  assert.match(build,/return '<link rel="stylesheet" href="\.\/styles\/app\.bundle\.css" \/>'/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v314'/);
  assert.match(build,/sw=sw\.replace\(/);
  assert.match(build,/"\.\/styles\/app\.bundle\.css"/);
  assert.match(live,/\.ta-settings-shell\{display:grid/);
  assert.match(live,/@media\(max-width:720px\)/);
  for(const sheet of [settings,live]){
    assert.doesNotMatch(sheet,/\.invoice-page\s*\{/);
    assert.doesNotMatch(sheet,/\.items-table\s*\{/);
  }
});

test('batch 6 preserves unsaved-settings protection and company/document saves',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  assert.match(settings,/companyInitial:string; documentsInitial:string/);
  assert.match(settings,/private hasUnsavedSettings=/);
  assert.match(settings,/private requestClose=/);
  assert.match(settings,/onClose=\{this\.requestClose\}/);
  assert.match(settings,/Discard unsaved settings\?/);
  assert.match(settings,/companyInitial:JSON\.stringify\(company\)/);
  assert.match(settings,/documentsInitial:JSON\.stringify\(appSettings\)/);
  assert.match(settings,/await this\.props\.onSaveCompany\(company\)/);
  assert.match(settings,/const settings=structuredClone\(this\.state\.appSettings\);const snapshot=JSON\.stringify\(settings\)/);
  assert.match(settings,/await this\.props\.onSaveAppSettings\(settings\)/);
  assert.match(settings,/documentsInitial:snapshot/);
  assert.match(settings,/Newer edits are still unsaved/);
});