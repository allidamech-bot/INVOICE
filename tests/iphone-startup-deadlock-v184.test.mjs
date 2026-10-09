import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('iPhone pre-render cloud work has a hard startup budget and cannot hold the boot shell forever',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/const STARTUP_CLOUD_BUDGET_MS=450/);
  assert.match(startup,/const FRESH_DEVICE_CLOUD_BUDGET_MS=6_000/);
  assert.match(startup,/const budgetMs=localBeforeStartup\?STARTUP_CLOUD_BUDGET_MS:FRESH_DEVICE_CLOUD_BUDGET_MS/);
  assert.doesNotMatch(startup,/if\(!localBeforeStartup\)\{\s*await cloudWork/);
  assert.match(startup,/const outcome=await Promise\.race\(\[/);
  assert.match(startup,/cloudWork\.then\(result=>\(\{kind:'done' as const,result\}\)\)/);
  assert.match(startup,/window\.setTimeout\(\(\)=>resolve\(\{kind:'timeout'\}\),budgetMs\)/);
  assert.match(startup,/if\(outcome\.kind==='done'\)return/);
});

test('timed-out cloud work becomes background reconciliation and only reloads after a proven cloud pull',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/void cloudWork\.then\(signalDeferredCloudPull\)\.catch\(\(\)=>undefined\)/);
  assert.match(startup,/function signalDeferredCloudPull\(result:StartupCloudResult\):void/);
  assert.match(startup,/if\(result!==\'pulled\'\)return/);
  assert.match(startup,/window\.dispatchEvent\(new Event\('lourex-cloud-applied'\)\)/);

  const entry=await read('src/app/index.tsx');
  assert.match(entry,/window\.addEventListener\('lourex-cloud-applied'/);
  assert.match(entry,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{/);
  assert.match(entry,/window\.addEventListener\('lourex-cloud-refresh-available',showCloudRefreshAvailable\)/);
  assert.match(entry,/title\.textContent='Cloud changes available/);
});

test('bounded startup still uses guarded reconcile and never switches to direct destructive cloud install',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/return await reconcileCloudVault\(user\.uid\)/);
  assert.match(startup,/if\(!local\)\{[\s\S]*await installCloudVault\(user\.uid\)/);
  assert.match(startup,/if\(linked&&linked\.uid!==user\.uid\)return 'skipped'/);
  assert.match(startup,/markLateStartupCloudApplyUnsafe\(\)/);
  assert.match(startup,/linked&&linked\.uid!==user\.uid/);
});

test('v184 delivers the deadlock recovery to installed iPhone PWAs as a fresh immutable generation',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v184';$/m);
  assert.match(sw,/lourex-invoice-v183: preserved as a legacy marker/);
  assert.ok(sw.includes('./src/cloud/startup.js'));
  assert.ok(sw.includes('./src/app/index.js'));
});
