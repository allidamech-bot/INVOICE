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

test('startup still resolves authoritative cloud state before React renders',async()=>{
  const entry=await read('src/app/index.tsx');
  const hydrate=entry.indexOf('await hydrateAuthoritativeCloudBeforeApp()');
  const render=entry.indexOf('ReactDOM.render');
  assert.ok(hydrate>=0&&render>hydrate);
});

test('v183 recaches the new boot shell and startup runtime without mutating v182 in place',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v183';$/m);
  assert.match(sw,/lourex-invoice-v182: preserved as a legacy marker/);
  assert.ok(sw.includes('./index.html'));
  assert.ok(sw.includes('./src/cloud/startup.js'));
});
