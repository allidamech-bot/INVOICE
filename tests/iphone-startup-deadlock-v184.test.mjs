import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('iPhone pre-render cloud work has a hard startup budget and cannot hold the boot shell forever',async()=>{
  const startup=await read('src/cloud/startup.ts');
  const budget=startup.match(/const STARTUP_CLOUD_BUDGET_MS=(\d+)/);
  assert.ok(budget,'startup cloud wait must have an explicit maximum');
  assert.ok(Number(budget[1])>0&&Number(budget[1])<=2200,'existing workspace startup must remain tightly bounded');
  assert.match(startup,/const outcome=await Promise\.race\(\[/);
  assert.match(startup,/cloudWork\.then\(result=>\(\{kind:'done' as const,result\}\)\)/);
  assert.match(startup,/window\.setTimeout\(\(\)=>resolve\(\{kind:'timeout'\}\),STARTUP_CLOUD_BUDGET_MS\)/);
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
  assert.match(entry,/if\(reloadUnsafeWorkspaceOpen\(\)\)return/);
});

test('bounded startup guards an existing vault and restores only an empty account scope',async()=>{
  const startup=await read('src/cloud/startup.ts');
  const afterLocal=startup.slice(startup.indexOf('const local=await getEncryptedVault()'),startup.indexOf('function signalDeferredCloudPull'));
  assert.match(afterLocal,/if\(!local\)\{/);
  assert.match(afterLocal,/await installCloudVault\(user\.uid\)/);
  assert.match(afterLocal,/return await reconcileCloudVault\(user\.uid\)/);
  assert.match(startup,/if\(linked&&linked\.uid!==user\.uid\)return 'skipped'/);
  assert.match(startup,/markLateStartupCloudApplyUnsafe\(\)/);
  assert.match(startup,/clearLateStartupCloudApplyGuard/);
});

test('v184 delivers the deadlock recovery to installed iPhone PWAs as a fresh immutable generation',async()=>{
  const sw=await read('public/sw.js');
  const generation=sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';$/m);
  assert.ok(generation,'the service worker must use an immutable versioned cache');
  assert.ok(Number(generation[1])>=184,'the installed generation must not regress below the original recovery');
  assert.ok(sw.includes('./src/cloud/startup.js'));
  assert.ok(sw.includes('./src/app/index.js'));
});
