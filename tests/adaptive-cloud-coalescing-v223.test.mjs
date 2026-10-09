import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v223 keeps remote publication size-aware and off Safari editing hot path without delaying encrypted local saves',async()=>{
  const policy=await import(new URL('../dist/src/cloud/coalescing.js',import.meta.url));
  assert.equal(policy.adaptiveCloudSettleMs(0,false),1_200);
  assert.equal(policy.adaptiveCloudSettleMs(0,true),15_000);
  assert.equal(policy.adaptiveCloudSettleMs(1_199_999,false),1_200);
  assert.equal(policy.adaptiveCloudSettleMs(1_200_000,false),2_500);
  assert.equal(policy.adaptiveCloudSettleMs(1_200_000,true),30_000);
  assert.equal(policy.adaptiveCloudSettleMs(4_799_999,false),2_500);
  assert.equal(policy.adaptiveCloudSettleMs(4_800_000,false),5_000);
  assert.equal(policy.adaptiveCloudSettleMs(4_800_000,true),60_000);
  assert.equal(policy.adaptiveCloudSettleMs(Number.NaN,false),1_200);
  assert.ok(policy.adaptiveCloudSettleMs(4_800_000,true)>=policy.adaptiveCloudSettleMs(0,true));
});

test('v223 wraps remote autosync scheduling but preserves explicit urgency outside editing and protects editors',async()=>{
  const [index,app]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx')]);
  assert.match(index,/import \{ App as BaseApp \} from '\.\/App\.js'/);
  assert.match(index,/import \{ adaptiveCloudSettleMs \} from '\.\.\/cloud\/coalescing\.js'/);
  assert.match(index,/class AdaptiveCloudApp extends BaseApp/);
  assert.match(index,/const requested=typeof delay==='number'\?delay:adaptive/);
  assert.match(index,/const editorSafe=editing\?Math\.max\(requested,adaptive\):requested/);
  assert.match(index,/const guarded=iosWebKit&&editing\?Math\.max\(30_000,editorSafe\):editorSafe/);
  assert.match(index,/deferQueuedCloudSaveForDocumentEdit=[\s\S]*adaptiveCloudSettleMs\(instance\.latestEncryptedVault\?\.cipher\?\.length\?\?0,true\)/);
  assert.match(index,/const App=AdaptiveCloudApp/);
  assert.match(index,/ReactDOM\.render\(<AppErrorBoundary><App\/><\/AppErrorBoundary>/);
  for(const delay of [80,120,150,180,500])assert.ok(app.includes('scheduleCloudSync('+delay+')'),
    'explicit recovery delay must remain available when no editor is mounted: '+delay);
  assert.match(app,/private persist=async[\s\S]*this\.scheduleCloudSync\(\)/);
});

test('v223 remains cached in the current installed-PWA generation',async()=>{
  const [patch,distSw]=await Promise.all([read('scripts/pwa-cache-v205.mjs'),read('dist/sw.js')]);
  assert.match(patch,/const CACHE = 'lourex-invoice-v228'/);
  assert.match(patch,/lourex-invoice-v223.*legacy marker/);
  assert.match(patch,/\.\/src\/cloud\/coalescing\.js/);
  assert.match(distSw,/const CACHE = 'lourex-invoice-v228'/);
  assert.match(distSw,/\.\/src\/cloud\/coalescing\.js/);
});
