import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('pull-to-refresh is opt-in and cannot discard real inline Operations/Product drafts',async()=>{
  const source=await read('public/pull-to-refresh.js');
  assert.match(source,/if\(appleMobile\|\|!document\.documentElement\.hasAttribute\('data-lourex-enable-pull-refresh'\)\)return/);
  assert.match(source,/if\(Boolean\(window\.__LOUREX_IOS_WEBKIT__\)\)return false/);
  assert.match(source,/if\(document\.documentElement\.hasAttribute\('data-lourex-workspace-dirty'\)\)return false/);
  assert.match(source,/if\(document\.documentElement\.hasAttribute\('data-lourex-document-editor'\)\)return false/);
  const blocked=source.slice(source.indexOf('const blockedTarget='),source.indexOf('const renderPaint='));
  assert.ok(blocked.length>400,'both gesture target and page-wide unsafe surface checks must exist');
  for(const selector of ['.ta-operations-page','.operations-page','.saved-items-page','.ta-product-editor.is-open','.product-library-pro.editor-open','.modal-backdrop','.editor-screen','.ta-mobile-sheet']){
    assert.ok(blocked.includes(selector),'unsafe draft/panel selector missing: '+selector);
  }
  assert.match(blocked,/return !blockedTarget\(target\)/);
});

test('PWA updates and cloud refresh ask before reload and protect dirty workspaces',async()=>{
  const source=await read('src/app/index.tsx');
  const editor=source.slice(source.indexOf('function isDocumentEditorOpen'),source.indexOf('function safeSignedOutAuthGatewayForAutomaticReload'));
  assert.match(editor,/data-lourex-document-editor/);
  assert.match(editor,/function activeDataEntryEditorOpen\(\):boolean/);
  assert.match(editor,/\.ta-product-editor\.is-open/);
  assert.match(editor,/\.ta-operations-page \.ta-ops-editor/);
  assert.match(editor,/function reloadUnsafeWorkspaceOpen\(\):boolean/);
  assert.match(editor,/data-lourex-workspace-dirty/);
  assert.match(editor,/activeDataEntryEditorOpen\(\)/);
  assert.match(editor,/\.modal-backdrop/);
  const refresh=source.slice(source.indexOf('function showCloudRefreshAvailable'),source.indexOf('window.addEventListener(\'lourex-cloud-refresh-available\''));
  assert.match(refresh,/if\(reloadUnsafeWorkspaceOpen\(\)\)/);
  assert.match(refresh,/rememberWorkspaceBeforeAutomaticReload\(\)/);
  assert.match(refresh,/window\.location\.reload\(\)/);
  const update=source.slice(source.indexOf('function showUpdateNotice'),source.indexOf("if('serviceWorker' in navigator)"));
  assert.match(update,/if\(reloadUnsafeWorkspaceOpen\(\)\)/);
  assert.match(update,/rememberWorkspaceBeforeAutomaticReload\(\)/);
});

test('cloud freshness is non-destructive, checks dirty state and disables Apple WebKit watcher',async()=>{
  const source=await read('src/cloud/freshness.ts');
  const predicate=source.slice(source.indexOf('function appIsSafeToApply'),source.indexOf('function detachRealtime'));
  assert.match(source,/const UNSAFE_SURFACE_SELECTOR=/);
  for(const selector of ['.editor-screen','.modal-backdrop','.ta-product-editor.is-open','.ta-operations-page .ta-ops-editor','.product-library-pro.editor-open']){
    assert.ok(source.includes(selector),'unsafe cloud surface missing: '+selector);
  }
  assert.match(predicate,/workspaceHasUnsavedChanges\(\)/);
  assert.match(predicate,/document\.querySelector\(UNSAFE_SURFACE_SELECTOR\)/);
  assert.match(predicate,/document\.activeElement/);
  assert.match(source,/if\(!appIsSafeToApply\(\)\)return/);
  assert.match(source,/if\(appleMobileWebKit\(\)\)/);
  assert.match(source,/lourex-cloud-refresh-available/);
  assert.doesNotMatch(source,/window\.location\.reload\(\)/,'a background freshness probe must never directly reload an editor');
});

test('cloud install revalidates authenticated ownership and unsaved editor state at the commit boundary',async()=>{
  const source=await read('src/cloud/firebase.ts');
  const predicate=source.slice(source.indexOf('function inlineDraftWorkspaceOpen'),source.indexOf('function splitCipher'));
  assert.match(predicate,/data-lourex-document-editor/);
  assert.match(predicate,/data-lourex-workspace-dirty/);
  assert.match(predicate,/\.editor-screen/);
  assert.match(predicate,/\.modal-backdrop/);
  const install=source.slice(source.indexOf('export async function installCloudVault'),source.indexOf('export async function pushLocalVaultToCloud'));
  assert.match(install,/requireCurrentUid\(uid\)/);
  assert.match(install,/if\(inlineDraftWorkspaceOpen\(\)\)throw new Error/);
  const network=install.indexOf('await pullCloudVaultFromMeta(uid,meta)');
  const persist=install.indexOf('await putSecurityAndVault(remote.security,remote.vault)');
  assert.ok(network>0&&persist>network,'cloud data must be validated after download and before replacing local data');
  const commitGuard=install.slice(network,persist);
  assert.match(commitGuard,/requireCurrentUid\(uid\)/);
  assert.match(commitGuard,/if\(inlineDraftWorkspaceOpen\(\)\)throw new Error/);
  assert.match(commitGuard,/meta.schemaVersion>APP_SCHEMA_VERSION/);
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/hydrateAuthoritativeCloudBeforeApp/);
  assert.match(startup,/return await reconcileCloudVault\(user\.uid\)/);
  assert.match(startup,/if\(!local\)\{/);
  assert.match(startup,/installCloudVault\(user\.uid\)/,'a truly empty device must be able to restore its existing encrypted cloud PIN');
});
