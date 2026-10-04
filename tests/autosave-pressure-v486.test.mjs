import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('v486 production build coalesces repeated full-vault document autosaves without weakening first checkpoint',async()=>{
  const source=await readFile('scripts/v350-rendering-storage-hardening.mjs','utf8');
  assert.match(source,/recentPersist = Date\.now\(\) - Number\(this\.__lourexLastPersistAt \|\| 0\) < 60000/);
  assert.match(source,/bytes >= 3 \* 1024 \* 1024 \? 22000 : bytes > 0 \? 16000 : 12000/);
  assert.match(source,/return bytes >= 3 \* 1024 \* 1024 \? 5500 : bytes > 0 \? 4200 : 3200/);
  assert.match(source,/return bytes >= 5 \* 1024 \* 1024 \? 8000 : bytes > 0 \? 6000 : 4000/);
  assert.match(source,/this\.__lourexLastPersistAt = Date\.now\(\)/);
});

test('v486 production build also coalesces repeated company Draft saves',async()=>{
  const source=await readFile('scripts/v350-rendering-storage-hardening.mjs','utf8');
  assert.match(source,/return IOS_WEBKIT \? 10000 : 3500/);
  assert.match(source,/return IOS_WEBKIT \? 1600 : 900/);
  assert.match(source,/DraftDocumentEditor\.autosaveDelay/);
  assert.match(source,/DraftDocumentEditor autosave persistence call/);
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