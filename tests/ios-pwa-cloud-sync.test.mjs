import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('iOS standalone protects local work by disabling the independent realtime freshness watcher',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/matchMedia\?\.\('\(display-mode: standalone\)'\)/);
  assert.match(freshness,/navigator as Navigator&\{standalone\?:boolean\}/);
  assert.match(freshness,/iP\(\?:hone\|ad\|od\)/);
  assert.match(freshness,/platform==='MacIntel'&&touchPoints>1/);
  assert.match(freshness,/if\(appleMobileWebKit\(\)\)\{/);
  assert.match(freshness,/detachRealtime\(\)/);
  assert.match(freshness,/cloudRemoteChangedSinceAnchor/);
  assert.match(freshness,/standalone\?1_500:5_000/);
  assert.match(freshness,/if\(isStandalonePwa\(\)\)schedule\(600\)/);
  assert.doesNotMatch(freshness,/await reconcileCloudVault\(/,'background freshness must never silently replace an iOS workspace');
  const ts=await import('typescript');
  const vm=await import('node:vm');
  const source=freshness.slice(freshness.indexOf('export function startCloudFreshnessWatcher()'));
  const compiled=ts.default.transpileModule(source,{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022}}).outputText;
  let detachCount=0,registered=0;
  const context={exports:{},watcherGeneration:0,stopped:false,pending:undefined,timer:undefined,
    appleMobileWebKit:()=>true,
    detachRealtime:()=>{detachCount++;},
    window:{addEventListener:()=>{registered++;},setInterval:()=>{registered++;}},
    document:{addEventListener:()=>{registered++;}}
  };
  vm.runInNewContext(compiled,context);
  const off=context.exports.startCloudFreshnessWatcher();
  assert.equal(typeof off,'function');
  assert.equal(context.stopped,true,'iOS watcher must stop');
  assert.equal(detachCount,1,'existing realtime observer must be disconnected');
  assert.equal(registered,0,'no competing polling/event loop should be installed on Apple WebKit');
});

test('disconnected installed app can reopen cloud account without restoring manual sync and lock controls',async()=>{
  const cloudCss=await read('src/styles/cloud.css');
  assert.match(cloudCss,/\.cloud-header-button\.cloud-local\{display:inline-flex!important\}/);
  assert.match(cloudCss,/\.header-lock-button[^\{]*\{display:none!important\}/);
  assert.match(cloudCss,/\.cloud-header-button[^\{]*\{display:none!important\}/);
});
