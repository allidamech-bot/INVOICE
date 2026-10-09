import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('iPhone pre-render startup budgets are finite for existing and new-device vaults',async()=>{
  const startup=await read('src/cloud/startup.ts');
  const existing=startup.match(/const STARTUP_CLOUD_BUDGET_MS=(\d+)/);
  const fresh=startup.match(/const FRESH_DEVICE_CLOUD_BUDGET_MS=([\d_]+)/);
  assert.ok(existing&&fresh,'both startup budgets must be explicit');
  assert.ok(Number(existing[1])>0&&Number(existing[1])<=2200,'existing local work must mount promptly');
  const freshMs=Number(fresh[1].replaceAll('_',''));
  assert.ok(freshMs>=Number(existing[1])&&freshMs<=6000,'new-device verification must be bounded');
  assert.match(startup,/const budgetMs=localBeforeStartup\?STARTUP_CLOUD_BUDGET_MS:FRESH_DEVICE_CLOUD_BUDGET_MS/);
  assert.match(startup,/const outcome=await Promise\.race\(\[/);
  assert.match(startup,/cloudWork\.then\(result=>\(\{kind:'done' as const,result\}\)\)/);
  assert.match(startup,/if\(timer!==undefined\)window\.clearTimeout\(timer\)/);
  assert.match(startup,/if\(outcome\.kind==='done'\)return/);

  // Execute the actual shipped function using virtual timers and an unresolved
  // remote Firestore operation: startup must not block React forever.
  const start=startup.indexOf('export async function hydrateAuthoritativeCloudBeforeApp():Promise<void>');
  assert.ok(start>=0,'actual startup function must be present');
  // Execute the real production declarations as well as the function. Isolating
  // only the function body misses its module-scoped budget constants.
  const budgetDeclarations=startup.match(/^const (?:STARTUP_CLOUD_BUDGET_MS|FRESH_DEVICE_CLOUD_BUDGET_MS)=[^\n]+;$/gm)??[];
  assert.equal(budgetDeclarations.length,2,'the test must execute both production startup budgets');
  const compiled=ts.transpileModule(budgetDeclarations.join('\n')+'\n'+startup.slice(start),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  for(const [local,expectedBudget] of [[{cipher:'local'},Number(existing[1])],[null,freshMs]]){
    const timerCalls=[];
    let marked=0,clearedGuard=0;
    const exports={};
    const sandbox={
      exports,
      navigator:{onLine:true},
      STARTUP_CLOUD_BUDGET_MS:Number(existing[1]),
      FRESH_DEVICE_CLOUD_BUDGET_MS:freshMs,
      getEncryptedVault:async()=>local,
      runAuthoritativeCloudStartup:()=>new Promise(()=>{}),
      markLateStartupCloudApplyUnsafe:()=>{marked++;},
      clearLateStartupCloudApplyGuard:()=>{clearedGuard++;},
      signalDeferredCloudPull:()=>{},
      window:{
        setTimeout:(callback,ms)=>{timerCalls.push({callback,ms});return timerCalls.length;},
        clearTimeout:()=>{}
      }
    };
    vm.runInNewContext(compiled,sandbox);
    const startupCall=exports.hydrateAuthoritativeCloudBeforeApp();
    for(let i=0;i<8&&timerCalls.length===0;i++)await Promise.resolve();
    assert.equal(timerCalls.length,1,'exactly one startup timeout must be scheduled');
    assert.equal(timerCalls[0].ms,expectedBudget,'startup must use the correct vault-aware budget');
    timerCalls[0].callback();
    await startupCall;
    assert.equal(marked,1,'timeout must block late cloud replacement at the storage boundary');
    assert.equal(clearedGuard,0,'unresolved cloud work retains its write guard');
  }
});

test('timed-out cloud work becomes background reconciliation and only reloads after a proven cloud pull',async()=>{
  const startup=await read('src/cloud/startup.ts');
  assert.match(startup,/void cloudWork\.then\(signalDeferredCloudPull\)\.catch\(\(\)=>undefined\)/);
  assert.match(startup,/function signalDeferredCloudPull\(result:StartupCloudResult\):void/);
  assert.match(startup,/if\(result!==\'pulled\'\)return/);
  assert.match(startup,/window\.dispatchEvent\(new Event\('lourex-cloud-applied'\)\)/);

  const entry=await read('src/app/index.tsx');
  assert.match(entry,/window\.addEventListener\('lourex-cloud-applied'/);
  // The resumed cloud copy is announced, but applying it must be a deliberate
  // user action and cannot replace an open editor's unsaved changes.
  assert.match(entry,/function showCloudRefreshAvailable\(\)/);
  assert.match(entry,/reload\.addEventListener\('click'/);
  assert.match(entry,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{/);
  assert.match(entry,/rememberWorkspaceBeforeAutomaticReload\(\)/);
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
  // Older cache signatures are intentionally preserved inside source comments.
  // The final declaration is the active service-worker generation.
  const generations=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  assert.ok(generations.length>0,'the service worker must use an immutable versioned cache');
  assert.ok(Number(generations.at(-1)[1])>=184,'the active installed generation must not regress below the original recovery');
  assert.ok(sw.includes('./src/cloud/startup.js'));
  assert.ok(sw.includes('./src/app/index.js'));
});
