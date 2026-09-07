import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('iPhone launch has a hard cloud-preflight budget before React renders',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.match(entry,/const CLOUD_STARTUP_BUDGET_MS=1_800;/);
  assert.match(entry,/async function hydrateCloudWithinStartupBudget\(\):Promise<void>/);
  assert.match(entry,/Promise\.race\(\[[\s\S]*hydrateAuthoritativeCloudBeforeApp\(\)[\s\S]*window\.setTimeout\(resolve,CLOUD_STARTUP_BUDGET_MS\)/);
  assert.match(entry,/await hydrateCloudWithinStartupBudget\(\);[\s\S]*ReactDOM\.render/);
});

test('timed-out launch still starts the safe background cloud freshness watcher',async()=>{
  const entry=await read('src/app/index.tsx');
  const render=entry.indexOf('ReactDOM.render');
  const watcher=entry.indexOf('startCloudFreshnessWatcher();');
  assert.ok(render>=0&&watcher>render);
  assert.match(entry,/window\.addEventListener\('lourex-cloud-applied'/);
  assert.match(entry,/if\(reloadUnsafeWorkspaceOpen\(\)\)return/);
});

test('v184 ships the bounded startup runtime through a fresh immutable PWA generation',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v184';$/m);
  assert.match(sw,/v184 iPhone startup timeout recovery/);
  assert.match(sw,/lourex-invoice-v183: preserved as a legacy marker/);
  assert.ok(sw.includes('./src/app/index.js'));
  assert.ok(sw.includes('./src/cloud/startup.js'));
});
