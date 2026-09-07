import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('iPhone startup paints a branded shell before blocking runtime scripts execute',async()=>{
  const html=await read('index.html');
  const boot=html.indexOf('id="lourex-boot"');
  const react=html.indexOf('react.production.min.js');
  assert.ok(boot>=0&&react>boot,'boot shell must be present before runtime scripts');
  assert.match(html,/#lourex-boot\{position:fixed;inset:0/);
  assert.match(html,/linear-gradient\(160deg,#071722 0%,#0b1d2d 58%,#102b3b 100%\)/);
  assert.match(html,/Preparing your secure workspace/);
  assert.match(html,/جارٍ تجهيز مساحة العمل الآمنة/);
  assert.match(html,/env\(safe-area-inset-top\)/);
  assert.match(html,/prefers-reduced-motion:reduce/);
});

test('cloud bootstrap uses an already-restored Firebase user before the slower auth wait',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/currentCloudUser/);
  const ready=startup.indexOf('let user=currentCloudUser()');
  const wait=startup.indexOf('await waitForCloudUser()');
  const reconcile=startup.indexOf('await reconcileCloudVault(user.uid)');
  assert.ok(ready>=0&&wait>ready&&reconcile>wait);
});

test('v184 keeps authoritative cloud preflight ahead of React while bounding its launch wait',async()=>{
  const entry=await read('src/app/index.tsx');
  const hydrate=entry.indexOf('hydrateAuthoritativeCloudBeforeApp()');
  const budget=entry.indexOf('CLOUD_STARTUP_BUDGET_MS');
  const race=entry.indexOf('Promise.race');
  const render=entry.indexOf('ReactDOM.render');
  assert.ok(budget>=0&&race>budget&&hydrate>race&&render>hydrate);
  assert.match(entry,/await hydrateCloudWithinStartupBudget\(\)/);
});

test('v183 boot recovery remains preserved after the fresh v184 cache generation',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v184';$/m);
  assert.match(sw,/lourex-invoice-v183: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v182: preserved as a legacy marker/);
  assert.ok(sw.includes('./index.html'));
  assert.ok(sw.includes('./src/cloud/startup.js'));
  assert.ok(sw.includes('./src/app/index.js'));
});
