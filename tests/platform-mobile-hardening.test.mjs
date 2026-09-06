import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('pull-to-refresh cannot discard inline Operations or Product Library drafts',async()=>{
  const source=await read('public/pull-to-refresh.js');
  assert.match(source,/\.operations-page/);
  assert.match(source,/\.saved-items-page/);
  assert.match(source,/document\.querySelector\('\.modal-backdrop,\.mobile-preview-overlay,\.editor-main,\.editor-screen,\.operations-page,\.saved-items-page'\)/);
  assert.match(source,/Unlike[\s\S]*modal-based forms[\s\S]*pull refresh must never discard them/);
});

test('PWA update and cloud-applied reloads respect inline draft workspaces',async()=>{
  const source=await read('src/app/index.tsx');
  assert.match(source,/function isDocumentEditorOpen\(\):boolean/);
  assert.match(source,/document\.querySelector\('\.editor-screen'\)/);
  assert.match(source,/function reloadUnsafeWorkspaceOpen\(\):boolean/);
  assert.match(source,/isDocumentEditorOpen\(\)\|\|Boolean\(document\.querySelector\('\.operations-page,\.product-library-pro\.editor-open,\.modal-backdrop'\)\)/);
  assert.match(source,/lourex-cloud-applied[\s\S]*reloadUnsafeWorkspaceOpen\(\)/);
  assert.match(source,/reload\.addEventListener\('click'[\s\S]*reloadUnsafeWorkspaceOpen\(\)/);
});

test('background cloud freshness waits for inline Operations and product drafts even after focus leaves the input',async()=>{
  const source=await read('src/cloud/freshness.ts');
  assert.match(source,/\.editor-screen,\.modal-backdrop,\.operations-page,\.product-library-pro\.editor-open/);
  assert.match(source,/activeElement alone is not sufficient/);
  assert.match(source,/if\(!appIsSafeToApply\(\)\)return/);
});

test('direct cloud-vault installation cannot replace local encrypted data behind an inline draft',async()=>{
  const source=await read('src/cloud/firebase.ts');
  assert.match(source,/function inlineDraftWorkspaceOpen\(\):boolean/);
  assert.match(source,/\.operations-page,\.product-library-pro\.editor-open/);
  assert.match(source,/installCloudVault[\s\S]*if\(inlineDraftWorkspaceOpen\(\)\)throw new Error/);
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/hydrateAuthoritativeCloudBeforeApp/);
  assert.match(startup,/await reconcileCloudVault\(user\.uid\)/);
  assert.doesNotMatch(startup,/await installCloudVault\(user\.uid,false\)/);
});
