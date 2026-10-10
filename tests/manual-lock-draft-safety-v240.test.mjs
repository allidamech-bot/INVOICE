import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v240 blocks deliberate lock while an inline data-entry workspace owns unsaved input',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.match(entry,/const lockNow=instance\.lockNow\.bind\(instance\)/);
  assert.match(entry,/instance\.lockNow=\(automatic:boolean\)=>\{/);
  assert.match(entry,/if\(!automatic&&manualLockUnsafeWorkspaceOpen\(\)\)/);
  assert.match(entry,/Close or save the open editor before locking the app/);
  assert.match(entry,/أغلق أو احفظ المحرر المفتوح قبل قفل التطبيق/);
  assert.match(entry,/return lockNow\(automatic\)/);
});

test('manual lock checks current document, product, purchasing and manual inventory draft surfaces',async()=>{
 const entry=await read('src/app/index.tsx');
 for(const token of ['function manualLockUnsafeWorkspaceOpen():boolean','isDocumentEditorOpen()','activeDataEntryEditorOpen()','inventoryEntryHasDraftInput()',"data-lourex-workspace-dirty",'.ta-product-editor.is-open','.ta-operations-page .ta-ops-editor','.product-library-pro.editor-open','.operations-page .purchase-editor'])assert.ok(entry.includes(token),token);
 assert.ok(entry.includes('if(!automatic&&manualLockUnsafeWorkspaceOpen())'),'manual lock must protect dirty entries');
 assert.ok(entry.includes("instance.lockNow=(automatic:boolean)=>"),'automatic security lock stays on the established path');
});

test('v240 leaves automatic inactivity lock security-authoritative',async()=>{
  const entry=await read('src/app/index.tsx');
  const guard=entry.indexOf('if(!automatic&&manualLockUnsafeWorkspaceOpen())');
  const delegate=entry.indexOf('return lockNow(automatic);',guard);
  assert.ok(guard>=0&&delegate>guard,'manual-only guard must delegate automatic locking to the established lock path');
  assert.match(entry,/instance\.lockTimer=window\.setTimeout\(\(\)=>\{[\s\S]*void instance\.lockNow\(true\)/);
});

test('v240 refreshes installed clients for manual lock draft safety',async()=>{
  const pwa=await read('scripts/pwa-cache-v205.mjs');
  assert.match(pwa,/v240 protects deliberate Lock from discarding unsaved inline data-entry state while automatic inactivity locking remains enforced/);
  assert.match(pwa,/lourex-invoice-v240: manual lock draft safety refresh/);
});
