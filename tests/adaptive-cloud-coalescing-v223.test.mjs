import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v223 keeps small vault sync fast and lengthens only automatic quiet windows for larger encrypted vaults',async()=>{
  const policy=await import(new URL('../dist/src/cloud/coalescing.js',import.meta.url));
  assert.equal(policy.adaptiveCloudSettleMs(0,false),350);
  assert.equal(policy.adaptiveCloudSettleMs(0,true),800);
  assert.equal(policy.adaptiveCloudSettleMs(1_199_999,false),350);
  assert.equal(policy.adaptiveCloudSettleMs(1_200_000,false),650);
  assert.equal(policy.adaptiveCloudSettleMs(1_200_000,true),1_200);
  assert.equal(policy.adaptiveCloudSettleMs(4_799_999,false),650);
  assert.equal(policy.adaptiveCloudSettleMs(4_800_000,false),1_200);
  assert.equal(policy.adaptiveCloudSettleMs(4_800_000,true),2_000);
  assert.equal(policy.adaptiveCloudSettleMs(Number.NaN,false),350);
});

test('v223 wraps only automatic App cloud scheduling while explicit recovery delays remain urgent',async()=>{
  const [index,app]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx')]);
  assert.match(index,/import \{ App as BaseApp \} from '\.\/App\.js'/);
  assert.match(index,/import \{ adaptiveCloudSettleMs \} from '\.\.\/cloud\/coalescing\.js'/);
  assert.match(index,/class AdaptiveCloudApp extends BaseApp/);
  assert.match(index,/typeof delay==='number'[\s\S]*\?delay[\s\S]*:adaptiveCloudSettleMs\(instance\.latestEncryptedVault\?\.cipher\?\.length\?\?0,false\)/);
  assert.match(index,/deferQueuedCloudSaveForDocumentEdit=[\s\S]*adaptiveCloudSettleMs\(instance\.latestEncryptedVault\?\.cipher\?\.length\?\?0,true\)/);
  assert.match(index,/const App=AdaptiveCloudApp/);
  assert.match(index,/ReactDOM\.render\(<AppErrorBoundary><App\/><\/AppErrorBoundary>/);
  for(const delay of [80,120,150,180,500])assert.ok(app.includes(`scheduleCloudSync(${delay})`),`urgent ${delay} ms path must remain explicit`);
  assert.match(app,/private persist=async[\s\S]*this\.scheduleCloudSync\(\)/);
});

test('v223 remains cached in the current installed-PWA generation',async()=>{
  const [patch,distSw]=await Promise.all([read('scripts/pwa-cache-v205.mjs'),read('dist/sw.js')]);
  assert.match(patch,/const CACHE = 'lourex-invoice-v224'/);
  assert.match(patch,/lourex-invoice-v223.*legacy marker/);
  assert.match(patch,/\.\/src\/cloud\/coalescing\.js/);
  assert.match(distSw,/const CACHE = 'lourex-invoice-v224'/);
  assert.match(distSw,/\.\/src\/cloud\/coalescing\.js/);
});
