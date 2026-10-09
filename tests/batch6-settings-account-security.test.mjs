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

test('batch 6 exposes account sign out without deleting local encrypted data',async()=>{
  const [settings,app,shell]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/app/App.tsx'),read('src/components/AppShell.tsx')]);
  assert.match(settings,/onCloudSignOut:\(\)=>Promise<void>/);
  assert.match(settings,/private signOutFromCloud=async/);
  assert.match(settings,/Signing out does not delete the encrypted data already stored on this device/);
  const signOut=settings.slice(settings.indexOf('private signOutFromCloud=async'),settings.indexOf('private saveButton'));
  assert.match(signOut,/await this\.props\.onCloudSignOut\(\)/);
  assert.doesNotMatch(signOut,/clearSession|delete|remove|installCloudVault|restoreVault|putCloudAccount/i);
  assert.doesNotMatch(signOut,/window\.location\.reload/);
  assert.match(app,/cloudUser=\{this\.state\.cloudUser\}[\s\S]{0,120}onCloudSignOut=\{this\.cloudSignOut\}/);
  assert.match(app,/private cloudSignOut=async\(\)=>\{try\{await signOutCloudUser\(\)/);
  assert.match(shell,/private signOutFromMore=async/);
  assert.match(shell,/await signOutCloudUser\(\)/);
  assert.match(shell,/await clearSession\(\)/);
  // The current shell deliberately exposes sign-out from the authenticated More sheet,
  // not the retired v163 settings button. Guard visibility and repeat invocation.
  assert.match(shell,/\{signedIn\?<button type="button" className="ta-sheet-signout" disabled=\{this\.state\.signingOut\}/);
  assert.match(shell,/if\(this\.state\.signingOut\)return/);
  assert.match(shell,/onClick=\{\(\)=>void this\.signOutFromMore\(\)\}/);
  const signOutShell=shell.slice(shell.indexOf('private signOutFromMore=async'),shell.indexOf('private activeEditorDocument='));
  const auth=signOutShell.indexOf('await signOutCloudUser()');
  const revoke=signOutShell.indexOf('await clearSession()');
  const redirect=signOutShell.indexOf('window.location.replace(window.location.href)');
  assert.ok(auth>=0&&revoke>auth&&redirect>revoke,'explicit sign-out must revoke auth and local PIN before navigation');
  assert.doesNotMatch(signOutShell,/deleteDatabase|deleteRecord\('vault'\)|putSecurityAndVault/);
  assert.match(shell,/t\('Sign Out','تسجيل الخروج'\)/);
});

test('batch 6 separates automatic account protection from explicit cloud recovery and exposes session locking',async()=>{
  const [settings,app]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/app/App.tsx')]);
  assert.match(settings,/Your encrypted workspace is protected automatically/);
  assert.match(settings,/confirmCloudRestore/);
  assert.match(settings,/Restore account data from cloud\?/);
  assert.match(settings,/await this\.props\.onCloudRestore\(\)/);
  assert.match(app,/resolveCloudConflictWithCloud\(user\.uid\)/);
  assert.match(settings,/The signed-in account copy will replace the current encrypted local vault on this device/);
  assert.match(settings,/Auto Lock/);
  assert.match(settings,/Lock Now/);
  assert.match(settings,/autoLockMinutes/);
  assert.match(settings,/this\.props\.onLock\(\)/);
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