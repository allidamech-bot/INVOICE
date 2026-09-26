import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v351 runtime guard loads before document entry/app runtime and blocks unsafe update buttons in capture phase',async()=>{
  const [html,guard]=await Promise.all([read('index.html'),read('public/runtime-safety-v334.js')]);
  const runtime=html.indexOf('runtime-safety-v334.js?v=344');
  const entry=html.indexOf('document-entry-v302.js?v=351');
  const app=html.indexOf('<script type="module" src="./src/app/index.js"></script>');
  assert.ok(runtime>0&&runtime<entry&&entry<app);
  assert.match(guard,/manualInventoryDraftOpen\(\)/);
  assert.match(guard,/\.operations-page \.ta-inventory-entry/);
  assert.match(guard,/data-lourex-workspace-dirty/);
  assert.match(guard,/\[data-lourex-update\] button,\[data-lourex-cloud-refresh\] button/);
  assert.match(guard,/document\.addEventListener\('click',[\s\S]*stopImmediatePropagation\(\)[\s\S]*,true\)/);
});

test('v334 global runtime guard is read-only with respect to business state',async()=>{
  const guard=await read('public/runtime-safety-v334.js');
  assert.doesNotMatch(guard,/firebase|indexedDB|saveVault|calculateTotals|persist\(|localStorage|sessionStorage/i);
  assert.doesNotMatch(guard,/\.value\s*=|setAttribute\(['"]data-lourex-workspace-dirty/i);
});

test('v351 startup watchdog never reloads automatically and only exposes explicit recovery while boot is alone',async()=>{
  const watchdog=await read('public/startup-watchdog-v321.js');
  assert.match(watchdog,/function startupSurface\(\)/);
  assert.match(watchdog,/function bootStillVisible\(\)[\s\S]*startupSurface\(\)[\s\S]*!document\.querySelector\('\.app-ui,\.auth-page,\.ta-auth-page,\.app-recovery,\.app-recovery-screen'\)/);
  assert.match(watchdog,/function recoverIfNeeded\(\)[\s\S]*automaticReload=no[\s\S]*showRecovery\(\)/);
  assert.match(watchdog,/startup-recovery-user-retry/);
  assert.doesNotMatch(watchdog,/setTimeout\([^\n]*location\.(?:reload|replace)/);
});

test('v351 pull-to-refresh cannot start on Apple, editors, Operations or mobile command sheets',async()=>{
  const pull=await read('public/pull-to-refresh.js');
  assert.match(pull,/platform==='MacIntel'&&touchPoints>1/);
  assert.match(pull,/if\(appleMobile\|\|!document\.documentElement\.hasAttribute\('data-lourex-enable-pull-refresh'\)\)return/);
  assert.match(pull,/data-lourex-document-editor/);
  assert.match(pull,/\.operations-page/);
  assert.match(pull,/\.product-library-pro\.editor-open/);
  assert.match(pull,/\.ta-mobile-sheet/);
  assert.match(pull,/\.ta-create-menu-mobile/);
  assert.match(pull,/\.global-search-panel/);
  assert.match(pull,/\.ta-doc-mobile-action-portal/);
});

test('PIN session is account-bound and never persists a raw PIN',async()=>{
  const session=await read('src/storage/session.ts');
  assert.match(session,/const ACCOUNT_TOKEN_PREFIX = 'acct:';/);
  assert.match(session,/tokenMatchesAccount/);
  assert.match(session,/runtimePinAuthorized/);
  assert.match(session,/SessionKeyRecord/);
  assert.doesNotMatch(session,/localStorage\.setItem\([^\n]*pin/i);
  assert.doesNotMatch(session,/sessionStorage\.setItem\([^\n]*pin/i);
});

test('workspace dirty contract covers the inline inventory timing window without marking all Operations browsing dirty',async()=>{
  const dirty=await read('src/lib/workspace-dirty.ts');
  assert.match(dirty,/function operationsInlineMovementDraft\(\):boolean/);
  assert.match(dirty,/\.ta-inventory-entry/);
  assert.match(dirty,/input\[inputmode="decimal"\]/);
  assert.match(dirty,/document\.activeElement/);
  assert.match(dirty,/entry\.contains\(active\)/);
  assert.match(dirty,/document\.documentElement\.hasAttribute\(ATTRIBUTE\)\|\|operationsInlineMovementDraft\(\)/);
  assert.doesNotMatch(dirty,/querySelector\(['"]\.operations-page['"]\)/);
});

test('cloud freshness blocks actual unsaved work, editors and modals without freezing ordinary Operations browsing',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/function appIsSafeToApply\(\):boolean/);
  assert.match(freshness,/data-lourex-document-editor/);
  assert.match(freshness,/workspaceHasUnsavedChanges/);
  assert.match(freshness,/if\(workspaceHasUnsavedChanges\(\)\)return false/);
  assert.match(freshness,/\.editor-screen,\.modal-backdrop,\.product-library-pro\.editor-open/);
  assert.doesNotMatch(freshness,/\.editor-screen,\.modal-backdrop,\.operations-page/);
  assert.match(freshness,/window\.dispatchEvent\(new Event\('lourex-cloud-refresh-available'\)\)/);
  assert.doesNotMatch(freshness,/window\.location\.(?:reload|replace)/);
});

test('App runtime serializes local vault writes and defers cloud publication while editing',async()=>{
  const [index,app]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx')]);
  assert.match(index,/registerVaultMutationBridge\(async mutation=>/);
  assert.match(index,/instance\.vaultWriteTail\.catch\(\(\)=>null\)\.then/);
  assert.match(index,/adaptiveCloudSettleMs\(cipherLength,editing\)/);
  assert.match(index,/iosWebKit&&editing\?Math\.max\(30_000,editorSafe\)/);
  assert.match(app,/private persist=async[\s\S]*this\.vaultWriteTail/);
  assert.match(app,/mergeVaultIntent/);
  assert.match(app,/saveVault/);
});

test('automatic Firebase account transitions are deferred while unsafe work is open',async()=>{
  const runtime=await read('public/document-entry-v302.js');
  assert.match(runtime,/function editorOrUnsafeWorkspaceOpen\(\)/);
  assert.match(runtime,/data-lourex-document-editor/);
  assert.match(runtime,/data-lourex-workspace-dirty/);
  assert.match(runtime,/function guardAutomaticAccountTransition\(event\)[\s\S]*editorOrUnsafeWorkspaceOpen\(\)[\s\S]*stopImmediatePropagation/);
});

test('PWA update/controller reload remains user-requested and editor-safe',async()=>{
  const index=await read('src/app/index.tsx');
  assert.match(index,/let reloadForUpdate=false/);
  assert.match(index,/const userRequestedReload=reloadForUpdate/);
  assert.match(index,/if\(!userRequestedReload\)return/);
  assert.match(index,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}/);
  assert.match(index,/waiting\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
});

test('account recovery never overwrites a local vault and reloads only from the explicit Open account action',async()=>{
  const source=await read('src/app/AuthScreenSelector.tsx');
  assert.match(source,/if\(localVault\)\{diag\('auth-recovery-stage','stage=blocked-local-vault'\);setRecoveryState\('blocked'\);return;\}/);
  assert.match(source,/cloudInstallAlreadyReloaded\(cloudUser\.uid\)/);
  assert.match(source,/if\(installed\)[\s\S]*setRecoveryState\('ready'\)[\s\S]*return/);
  const openAction=source.slice(source.indexOf("if(recoveryState==='ready')"),source.indexOf('return <SetupScreen'));
  assert.match(openAction,/markCloudInstallReload\(cloudUser\.uid\)/);
  assert.match(openAction,/markReload\('auth-cloud-install-user-open'\)/);
  assert.match(openAction,/window\.location\.reload\(\)/);
  const recoveryEffect=source.slice(source.indexOf('React.useEffect'),source.indexOf('if (!cloudUser)'));
  assert.doesNotMatch(recoveryEffect,/window\.location\.(?:reload|replace)/);
});

test('Operations owns a real dirty marker for supplier, purchase, expense and movement drafts',async()=>{
  const operations=await read('src/components/OperationsPage.tsx');
  assert.match(operations,/private hasUnsavedWorkspaceInput=\(\):boolean=>/);
  assert.match(operations,/supplierDirty\|\|purchaseDirty\|\|expenseDirty\|\|movementDirty/);
  assert.match(operations,/setWorkspaceDirty\('operations',this\.hasUnsavedWorkspaceInput\(\)\)/);
  assert.match(operations,/beforeunload/);
});
