import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v218 coalesces consecutive local commits before full-vault cloud publication',async()=>{
  const [app,editor,wrapper]=await Promise.all([
    read('src/app/App.tsx'),read('src/components/EditorPageCore.tsx'),read('src/components/EditorPage.tsx')
  ]);
  assert.match(app,/const CLOUD_SAVE_SETTLE_MS=350/);
  assert.match(app,/const CLOUD_EDIT_ACTIVITY_SETTLE_MS=800/);
  assert.match(app,/private scheduleCloudSync=\(delay=CLOUD_SAVE_SETTLE_MS\)/);
  assert.match(app,/private persist=async[\s\S]*this\.scheduleCloudSync\(\)/);
  assert.match(app,/deferQueuedCloudSaveForDocumentEdit=[\s\S]*cloudSyncState!=='queued'[\s\S]*clearTimeout\(this\.cloudTimer\)[\s\S]*CLOUD_EDIT_ACTIVITY_SETTLE_MS/);
  assert.match(app,/onEditActivity=\{this\.deferQueuedCloudSaveForDocumentEdit\}/);
  assert.match(editor,/onEditActivity\?:\(\)=>void/);
  assert.match(editor,/private mutate=[\s\S]*this\.props\.onEditActivity\?\.\(\)/);
  assert.match(wrapper,/onEditActivity\?:\(\)=>void/);
  assert.doesNotMatch(app,/private scheduleCloudSync=\(delay=220\)/);
});

test('V2 retries failed uploads and reconciles remote state immediately on connectivity return',async()=>{
  const app=await read('src/app/App.tsx');
  assert.match(app,/private cloudSyncNow=async/);
  assert.match(app,/private handleOnline=\(\)=>\{/);
  assert.match(app,/void this\.cloudSyncNow\(\)\.catch/);
  assert.match(app,/this\.cloudRetryDelay=Math\.min\(60_000,this\.cloudRetryDelay\*2\)/);
  assert.match(app,/cloudReconcileQueued=true/);
  assert.match(app,/retryDeferredRemoteHydration\(\)/);
});

test('v218 advances the immutable installed-PWA generation',async()=>{
  const [sw,patch]=await Promise.all([read('public/sw.js'),read('scripts/pwa-cache-v205.mjs')]);
  assert.match(sw,/v218 cloud coalescing/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v218'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v217'.*legacy marker/);
  assert.match(patch,/v218 coalesces consecutive local saves/);
});
