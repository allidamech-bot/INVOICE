import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('V2 has no manual device PIN lock and protects dirty inline editors during cloud refresh',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.doesNotMatch(entry,/instance\.lockNow=|instance\.lockNow\.bind\(/);
  assert.match(entry,/instance\.cloudReplaceBlocked=\(\)=>/);
  assert.match(entry,/reloadUnsafeWorkspaceOpen\(\)/);
});

test('cloud refresh guard checks current document, product, purchasing and inventory draft surfaces',async()=>{
 const entry=await read('src/app/index.tsx');
 for(const token of ['function manualLockUnsafeWorkspaceOpen():boolean','isDocumentEditorOpen()','activeDataEntryEditorOpen()','inventoryEntryHasDraftInput()',"data-lourex-workspace-dirty",'.ta-product-editor.is-open','.ta-operations-page .ta-ops-editor','.product-library-pro.editor-open','.operations-page .purchase-editor'])assert.ok(entry.includes(token),token);
 assert.ok(entry.includes('instance.cloudReplaceBlocked=()=>'),'cloud refresh must protect dirty entries');
 assert.ok(entry.includes('reloadUnsafeWorkspaceOpen()'),'refresh guard must include inline editors');
});

test('V2 leaves Firebase Auth, not device PIN, as the only interactive security boundary',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.doesNotMatch(entry,/instance\.lockTimer=window\.setTimeout|instance\.lockNow\.bind/);
  assert.match(entry,/resolveRequiredAccountSession\(\)/);
  assert.match(entry,/startAccountSignOutWatcher\(\)/);
});

test('v240 refreshes installed clients for manual lock draft safety',async()=>{
  const pwa=await read('scripts/pwa-cache-v205.mjs');
  assert.match(pwa,/v240 protects deliberate Lock from discarding unsaved inline data-entry state while automatic inactivity locking remains enforced/);
  assert.match(pwa,/lourex-invoice-v240: manual lock draft safety refresh/);
});
