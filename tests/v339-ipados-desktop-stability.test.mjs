import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

const desktopIpad=/platform==='MacIntel'&&touchPoints>1/;

test('v339 cloud coalescing treats desktop-UA iPadOS as Apple mobile WebKit',async()=>{
  const source=await read('src/cloud/coalescing.ts');
  assert.match(source,desktopIpad);
  assert.match(source,/__LOUREX_IOS_WEBKIT__/);
  assert.match(source,/activeEditing&&appleMobileWebKit\(\)\?Math\.max\(30_000,settle\):settle/);
});

test('v339 realtime freshness watcher is retired on all Apple mobile WebKit variants',async()=>{
  const source=await read('src/cloud/freshness.ts');
  assert.match(source,desktopIpad);
  assert.match(source,/if\(appleMobileWebKit\(\)\)\{/);
  assert.match(source,/detachRealtime\(\)/);
  assert.match(source,/return \(\)=>undefined/);
  assert.doesNotMatch(source,/window\.location\.(?:reload|replace|assign)/);
});

test('v339 attachment memory safeguards include desktop-UA iPadOS',async()=>{
  const source=await read('src/components/DocumentAttachmentsSection.tsx');
  assert.match(source,desktopIpad);
  assert.match(source,/MAX_FILE_BYTES=\(IOS_WEBKIT\?3:5\)\*MB/);
  assert.match(source,/MAX_TOTAL_BYTES=\(IOS_WEBKIT\?5:8\)\*MB/);
  assert.match(source,/MAX_FILES=IOS_WEBKIT\?6:8/);
  assert.match(source,/decodeThumbnail=image&&!IOS_WEBKIT/);
});
