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

test('v240 covers document, editable Operations, product, modal and manual inventory draft surfaces',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.match(entry,/function manualLockUnsafeWorkspaceOpen\(\):boolean/);
  assert.match(entry,/if\(isDocumentEditorOpen\(\)\)return true/);
  assert.match(entry,/\.operations-editor:not\(\.purchase-editor\),\.purchase-editor fieldset:not\(\[disabled\]\)/);
  assert.match(entry,/\.product-library-pro\.editor-open,\.modal-backdrop/);
  assert.match(entry,/inventoryEntryHasDraftInput\(\)/);
  assert.match(entry,/\.operations-page \.inventory-entry/);
  assert.match(entry,/input\[inputmode="decimal"\]/);
  assert.match(entry,/input:not\(\[type="date"\]\):not\(\[list\]\)/);
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
