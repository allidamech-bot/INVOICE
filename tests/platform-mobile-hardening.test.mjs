import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('pull-to-refresh never reloads a mobile editor or an unsaved Operations / Products draft',async()=>{
  const source=await read('public/pull-to-refresh.js');
  assert.match(source,/data-lourex-enable-pull-refresh/);
  assert.match(source,/data-lourex-document-editor/);
  assert.match(source,/data-lourex-workspace-dirty/);
  assert.match(source,/\.ta-operations-page/);
  assert.match(source,/\.operations-page/);
  assert.match(source,/\.ta-products-workspace/);
  assert.match(source,/\.saved-items-page/);
  assert.match(source,/\.product-library-pro\.editor-open/);
  assert.match(source,/\.modal-backdrop/);
  assert.match(source,/\.editor-screen/);
  assert.match(source,/pull refresh must never discard them/);
  assert.match(source,/if\(appleMobile\|\|!document\.documentElement\.hasAttribute\('data-lourex-enable-pull-refresh'\)\)return/);
});

test('update and cloud-refresh controls refuse to reload while active drafts are open',async()=>{
  const entry=await read('src/app/index.tsx');
  const reload=entry.slice(entry.indexOf('function isDocumentEditorOpen'),entry.indexOf("window.addEventListener('keydown'"));
  assert.match(reload,/function activeDataEntryEditorOpen/);
  assert.match(reload,/function reloadUnsafeWorkspaceOpen/);
  assert.match(reload,/data-lourex-workspace-dirty/);
  assert.match(reload,/activeDataEntryEditorOpen\(\)/);
  assert.match(reload,/\.modal-backdrop/);
  assert.match(reload,/reload\.addEventListener\('click'/);
  assert.match(reload,/if\(reloadUnsafeWorkspaceOpen\(\)\)/);
  assert.match(reload,/Cloud changes available/);
  assert.match(reload,/Close the open editor first/);
});

test('cloud freshness detects dirty inline drafts without freezing safe Operations browsing',async()=>{
  const [freshness,dirty]=await Promise.all([read('src/cloud/freshness.ts'),read('src/lib/workspace-dirty.ts')]);
  assert.match(freshness,/UNSAFE_SURFACE_SELECTOR/);
  assert.match(freshness,/\.ta-operations-page \.ta-ops-editor/);
  assert.match(freshness,/\.product-library-pro\.editor-open/);
  assert.match(freshness,/if\(workspaceHasUnsavedChanges\(\)\)return false/);
  assert.match(freshness,/if\(!appIsSafeToApply\(\)\)return/);
  assert.doesNotMatch(freshness,/document\.querySelector\('\.operations-page'\)/);
  assert.match(dirty,/function operationsInlineMovementDraft/);
  assert.match(dirty,/input\[inputmode="decimal"\]/);
  assert.match(dirty,/document\.activeElement/);
  assert.match(dirty,/entry\.contains\(active\)/);
});

test('cloud vault installer checks both ownership and dirty UI after network reads',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const install=cloud.slice(cloud.indexOf('export async function installCloudVault'),cloud.indexOf('export async function pushLocalVaultToCloud'));
  const readAt=install.indexOf('const remote=await pullCloudVaultFromMeta(uid,meta)');
  const writeAt=install.indexOf('await putSecurityAndVault(remote.security,remote.vault)');
  assert.ok(readAt>=0&&writeAt>readAt);
  const guard=install.slice(readAt,writeAt);
  assert.match(guard,/requireCurrentUid\(uid\)/);
  assert.match(guard,/if\(inlineDraftWorkspaceOpen\(\)\)throw new Error/);
  assert.match(guard,/if\(signal\?\.aborted\)throw new DOMException/);
  const owner=cloud.slice(cloud.indexOf('function inlineDraftWorkspaceOpen'),cloud.indexOf('function splitCipher'));
  assert.match(owner,/data-lourex-workspace-dirty/);
  assert.match(owner,/\.editor-screen/);
  assert.match(owner,/\.modal-backdrop/);
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/markLateStartupCloudApplyUnsafe\(\)/);
  assert.match(startup,/await installCloudVault\(user\.uid\)/);
});
