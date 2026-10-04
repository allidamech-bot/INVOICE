import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('v486 automatic document saves use a small encrypted checkpoint instead of delaying full-vault autosave',async()=>{
  const [script,checkpoint]=await Promise.all([
    readFile('scripts/v350-rendering-storage-hardening.mjs','utf8'),
    readFile('src/storage/document-autosave.ts','utf8')
  ]);
  assert.match(script,/saveDocumentAutosaveCheckpoint\(key, updated, checkpointEvents/);
  assert.match(script,/auto && updated\.status === 'draft'/);
  assert.match(script,/return bytes >= 3 \* 1024 \* 1024 \? 5500 : bytes > 0 \? 4200 : 3200/);
  assert.doesNotMatch(script,/22000|16000|12000|__lourexLastPersistAt/);
  assert.match(checkpoint,/crypto\.subtle\.encrypt\(\{name:'AES-GCM'/);
  assert.match(checkpoint,/RECORD_ID='document-autosave'/);
});

test('v486 folds a recovered checkpoint into the full encrypted vault after Safari process recovery',async()=>{
  const script=await readFile('scripts/v350-rendering-storage-hardening.mjs','utf8');
  assert.match(script,/recoverDocumentAutosaveCheckpoint\(resumed\.key, vault\)/);
  assert.match(script,/recoverDocumentAutosaveCheckpoint\(result\.key, result\.vault\)/);
  assert.match(script,/recoveredEncrypted = await saveVault/);
  assert.match(script,/await clearDocumentAutosaveCheckpoint\(\)/);
});

test('v486 keeps established Draft and commercial first-checkpoint cadence',async()=>{
  const source=await readFile('scripts/v350-rendering-storage-hardening.mjs','utf8');
  assert.match(source,/autosaveDelay = \(\) => IOS_WEBKIT \? 1600 : 900/);
  assert.match(source,/bytes >= 5 \* 1024 \* 1024 \? 1600 : bytes > 0 \? 1200 : 800/);
});

test('v486 keeps immediate departure durability paths in both editors',async()=>{
  const [editor,draft]=await Promise.all([
    readFile('src/components/EditorPageCore.tsx','utf8'),
    readFile('src/components/DraftDocumentEditor.tsx','utf8')
  ]);
  for(const source of [editor,draft]){
    assert.match(source,/visibilitychange/);
    assert.match(source,/pagehide/);
    assert.match(source,/flushPendingSnapshot/);
    assert.match(source,/beforeunload/);
  }
});
