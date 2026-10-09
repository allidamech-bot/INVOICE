import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('adaptive cloud publication uses bounded size-aware delays without slowing encrypted local save',async()=>{
  const policy=await import(new URL('../dist/src/cloud/coalescing.js',import.meta.url));
  assert.equal(policy.adaptiveCloudSettleMs(0,false),policy.CLOUD_SAVE_SETTLE_MS);
  assert.equal(policy.adaptiveCloudSettleMs(0,true),policy.CLOUD_EDIT_ACTIVITY_SETTLE_MS);
  assert.equal(policy.adaptiveCloudSettleMs(1_199_999,false),policy.CLOUD_SAVE_SETTLE_MS);
  assert.equal(policy.adaptiveCloudSettleMs(1_200_000,false),policy.CLOUD_MEDIUM_SAVE_SETTLE_MS);
  assert.equal(policy.adaptiveCloudSettleMs(1_200_000,true),policy.CLOUD_MEDIUM_EDIT_SETTLE_MS);
  assert.equal(policy.adaptiveCloudSettleMs(4_799_999,false),policy.CLOUD_MEDIUM_SAVE_SETTLE_MS);
  assert.equal(policy.adaptiveCloudSettleMs(4_800_000,false),policy.CLOUD_LARGE_SAVE_SETTLE_MS);
  assert.equal(policy.adaptiveCloudSettleMs(4_800_000,true),policy.CLOUD_LARGE_EDIT_SETTLE_MS);
  assert.equal(policy.adaptiveCloudSettleMs(Number.NaN,false),policy.CLOUD_SAVE_SETTLE_MS);
  assert.ok(policy.CLOUD_SAVE_SETTLE_MS<policy.CLOUD_MEDIUM_SAVE_SETTLE_MS);
  assert.ok(policy.CLOUD_MEDIUM_SAVE_SETTLE_MS<policy.CLOUD_LARGE_SAVE_SETTLE_MS);
  assert.ok(policy.CLOUD_EDIT_ACTIVITY_SETTLE_MS>policy.CLOUD_SAVE_SETTLE_MS);
  assert.ok(policy.CLOUD_MEDIUM_EDIT_SETTLE_MS>policy.CLOUD_MEDIUM_SAVE_SETTLE_MS);
  assert.ok(policy.CLOUD_LARGE_EDIT_SETTLE_MS>policy.CLOUD_LARGE_SAVE_SETTLE_MS);
});

test('adaptive App scheduling clamps short editor uploads but preserves explicit urgent delays elsewhere',async()=>{
  const [index,app,policy]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx'),read('src/cloud/coalescing.ts')]);
  assert.match(index,/import \{ App as BaseApp \} from '\.\/App\.js'/);
  assert.match(index,/import \{ adaptiveCloudSettleMs \} from '\.\.\/cloud\/coalescing\.js'/);
  assert.match(index,/class AdaptiveCloudApp extends BaseApp/);
  assert.match(index,/const requested=typeof delay==='number'\?delay:adaptive/);
  assert.match(index,/const editorSafe=editing\?Math\.max\(requested,adaptive\):requested/);
  assert.match(index,/iosWebKit&&editing\?Math\.max\(30_000,editorSafe\):editorSafe/);
  assert.match(index,/deferQueuedCloudSaveForDocumentEdit=[\s\S]*adaptiveCloudSettleMs\(instance\.latestEncryptedVault\?\.cipher\?\.length\?\?0,true\)/);
  assert.match(index,/const App=AdaptiveCloudApp/);
  assert.match(index,/ReactDOM\.render\(<AppErrorBoundary><App\/><\/AppErrorBoundary>/);
  // Explicit recovery calls remain, but editor uploads cannot bypass safety.
  for(const delay of [80,120,150,180,500])assert.ok(app.includes('scheduleCloudSync('+delay+')'),'explicit recovery call must remain: '+delay);
  assert.match(app,/private persist=async[\s\S]*this\.scheduleCloudSync\(\)/);
  assert.match(policy,/Local encrypted persistence still happens first/);
  assert.match(policy,/activeEditing&&appleMobileWebKit\(\)\?Math\.max\(30_000,settle\):settle/);
});

test('v223 remains cached in the current installed-PWA generation',async()=>{
  const [patch,distSw]=await Promise.all([read('scripts/pwa-cache-v205.mjs'),read('dist/sw.js')]);
  assert.match(patch,/const CACHE = 'lourex-invoice-v228'/);
  assert.match(patch,/lourex-invoice-v223.*legacy marker/);
  assert.match(patch,/\.\/src\/cloud\/coalescing\.js/);
  assert.match(distSw,/const CACHE = 'lourex-invoice-v228'/);
  assert.match(distSw,/\.\/src\/cloud\/coalescing\.js/);
});
