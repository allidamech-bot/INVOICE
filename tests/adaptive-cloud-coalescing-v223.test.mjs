import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('encrypted cloud publishing defers only remote writes while keeping a monotonic, size-aware bound',async()=>{
  const policy=await import('../dist/src/cloud/coalescing.js');
  assert.equal(policy.CLOUD_SAVE_SETTLE_MS,1_200);
  assert.equal(policy.CLOUD_EDIT_ACTIVITY_SETTLE_MS,15_000);
  assert.equal(policy.CLOUD_MEDIUM_CIPHER_LENGTH,1_200_000);
  assert.equal(policy.CLOUD_LARGE_CIPHER_LENGTH,4_800_000);
  assert.equal(policy.adaptiveCloudSettleMs(0,false),1_200);
  assert.equal(policy.adaptiveCloudSettleMs(0,true),15_000);
  assert.equal(policy.adaptiveCloudSettleMs(1_199_999,false),1_200);
  assert.equal(policy.adaptiveCloudSettleMs(1_200_000,false),2_500);
  assert.equal(policy.adaptiveCloudSettleMs(1_200_000,true),30_000);
  assert.equal(policy.adaptiveCloudSettleMs(4_799_999,false),2_500);
  assert.equal(policy.adaptiveCloudSettleMs(4_800_000,false),5_000);
  assert.equal(policy.adaptiveCloudSettleMs(4_800_000,true),60_000);
  assert.equal(policy.adaptiveCloudSettleMs(Number.NaN,false),1_200);
  assert.equal(policy.adaptiveCloudSettleMs(-1,false),1_200);
  assert.ok(policy.adaptiveCloudSettleMs(6_000_000,true)>=policy.adaptiveCloudSettleMs(6_000_000,false));
});

test('cloud scheduling preserves explicit requests and always protects the active document editor',async()=>{
  const [index,app,policy]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx'),read('src/cloud/coalescing.ts')]);
  assert.match(index,/class AdaptiveCloudApp extends BaseApp/);
  assert.match(index,/const adaptive=adaptiveCloudSettleMs\(cipherLength,editing\)/);
  assert.match(index,/const requested=typeof delay==='number'\?delay:adaptive/);
  assert.match(index,/const editorSafe=editing\?Math\.max\(requested,adaptive\):requested/);
  assert.match(index,/const guarded=iosWebKit&&editing\?Math\.max\(30_000,editorSafe\):editorSafe/);
  assert.match(index,/instance\.scheduleCloudSync=\(delay\?:number\)=>/);
  assert.match(index,/instance\.deferQueuedCloudSaveForDocumentEdit=\(\)=>/);
  assert.match(index,/const App=AdaptiveCloudApp/);
  assert.match(app,/private persist=async/);
  assert.match(app,/this\.scheduleCloudSync\(\)/);
  assert.match(policy,/Local encrypted persistence still happens first/);
});

test('service worker includes the current cloud coalescing runtime without an obsolete cache-generation assertion',async()=>{
  const [patch,sw,distSw]=await Promise.all([read('scripts/pwa-cache-v205.mjs'),read('public/sw.js'),read('dist/sw.js')]);
  assert.ok(patch.includes('./src/cloud/coalescing.js'),'the cache generator must include the cloud module');
  assert.ok(distSw.includes('./src/cloud/coalescing.js'),'the built service worker must precache the cloud module');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v\d+';$/m,'the source service worker must declare its own active cache');
  const active=[...distSw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  assert.equal(active.length,1,'built PWA must have exactly one active application cache generation');
  assert.ok(Number(active[0][1])>=228,'the current cache must not regress behind the cloud scheduling release');
  assert.match(distSw,/key!==CACHE&&key\.startsWith\(APP_CACHE_PREFIX\)/);
});
