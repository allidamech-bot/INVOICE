import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v311 cloud replacement guard follows actual unsaved workspace state',async()=>{
  const entry=await read('src/app/index.tsx');

  assert.match(entry,/class AdaptiveCloudApp extends BaseApp/);
  assert.match(entry,/instance\.cloudReplaceBlocked=\(\)=>instance\.state\.screen==='editor'\|\|instance\.state\.settingsOpen\|\|instance\.state\.cloudModal\|\|reloadUnsafeWorkspaceOpen\(\)/);
  assert.match(entry,/function reloadUnsafeWorkspaceOpen\(\):boolean\{[\s\S]*isDocumentEditorOpen\(\)[\s\S]*data-lourex-workspace-dirty[\s\S]*\.modal-backdrop/);
  assert.doesNotMatch(entry,/function reloadUnsafeWorkspaceOpen\(\):boolean\{[^}]*\.operations-page/);
});

test('v311 automatic cloud freshness never hard-reloads the active workspace',async()=>{
  const [entry,freshness]=await Promise.all([
    read('src/app/index.tsx'),
    read('src/cloud/freshness.ts')
  ]);

  assert.match(entry,/lourex-cloud-refresh-available[\s\S]*showCloudRefreshAvailable/);
  assert.match(entry,/reload\.addEventListener\('click',[\s\S]*if\(reloadUnsafeWorkspaceOpen\(\)\)/);
  assert.match(entry,/controllerchange[\s\S]*if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}/);
  assert.match(freshness,/lourex-cloud-refresh-available/);
  assert.doesNotMatch(freshness,/window\.location\.(?:reload|replace)/);
});

test('v235 installed-client cache marker remains documented for compatibility',async()=>{
  const pwa=await read('scripts/pwa-cache-v205.mjs');
  assert.match(pwa,/v235 blocks automatic remote-cloud replacement while an unsafe data-entry workspace is open/);
  assert.match(pwa,/lourex-invoice-v235: guarded cloud replacement refresh/);
});
