import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('workspace dirty contract covers inline inventory movement race without marking all Operations browsing dirty',async()=>{
  const source=await read('src/lib/workspace-dirty.ts');
  assert.match(source,/function operationsInlineMovementDraft\(\):boolean/);
  assert.match(source,/\.ta-inventory-entry/);
  assert.match(source,/input\[inputmode="decimal"\]/);
  assert.match(source,/document\.activeElement/);
  assert.match(source,/entry\.contains\(active\)/);
  assert.match(source,/document\.documentElement\.hasAttribute\(ATTRIBUTE\)\|\|operationsInlineMovementDraft\(\)/);
  assert.doesNotMatch(source,/querySelector\(['"]\.operations-page['"]\)/);
});

test('cloud freshness blocks actual unsaved work instead of the entire Operations workspace',async()=>{
  const source=await read('src/cloud/freshness.ts');
  assert.match(source,/workspaceHasUnsavedChanges/);
  assert.match(source,/if\(workspaceHasUnsavedChanges\(\)\)return false/);
  assert.match(source,/\.editor-screen,\.modal-backdrop,\.product-library-pro\.editor-open/);
  assert.doesNotMatch(source,/\.editor-screen,\.modal-backdrop,\.operations-page/);
});

test('Safari/PWA automatic account and update paths remain guarded against active editors',async()=>{
  const [index,runtime]=await Promise.all([read('src/app/index.tsx'),read('public/document-entry-v302.js')]);
  assert.match(index,/function reloadUnsafeWorkspaceOpen\(\):boolean/);
  assert.match(index,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{[\s\S]*Close the open editor/);
  assert.match(index,/const userRequestedReload=reloadForUpdate/);
  assert.match(index,/if\(!userRequestedReload\)return/);
  assert.match(runtime,/function editorOrUnsafeWorkspaceOpen\(\)/);
  assert.match(runtime,/if\(editorOrUnsafeWorkspaceOpen\(\)\)/);
  assert.match(runtime,/lourex-account-transition-request/);
});

test('account recovery reload is one-shot and only allowed when no local encrypted vault exists',async()=>{
  const source=await read('src/app/AuthScreenSelector.tsx');
  assert.match(source,/if\(localVault\)\{setRecoveryState\('blocked'\);return;\}/);
  assert.match(source,/cloudInstallAlreadyReloaded\(cloudUser\.uid\)/);
  assert.match(source,/markCloudInstallReload\(cloudUser\.uid\);window\.location\.reload\(\)/);
});
