import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const boot=readFileSync('public/theme-bootstrap-v347.js','utf8');
const worker=readFileSync('public/sw.js','utf8');

test('external font stylesheet is non-render-blocking but retains the original font families',()=>{
  const link=html.match(/<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^>]+>/)?.[0]||'';
  assert.match(link,/rel="stylesheet"/);
  assert.match(link,/media="print"/);
  assert.match(link,/data-lourex-deferred-fonts="true"/);
  for(const family of ['Cairo','Inter','Montserrat','Noto+Kufi+Arabic','Noto+Sans+Arabic','Tajawal'])
    assert.ok(link.includes(family),'missing original font '+family);
  assert.match(boot,/link\.addEventListener\('load',enable,\{once:true\}\)/);
  assert.match(boot,/link\.media='all'/);
});

test('initial loading still shows the approved LOUREX logo without layout shift',()=>{
  assert.match(html,/<img src="\.\/brand\/lourex-header-logo\.jpeg" alt="LOUREX" decoding="async" width="108" height="108" \/>/);
  assert.match(html,/id="lourex-boot"/);
  assert.match(html,/src="\.\/src\/app\/index\.js"/);
});

test('service worker retains all local cache entries while bounding concurrent requests',async()=>{
  assert.match(worker,/await precacheWithBoundedConcurrency\(cache,LOCAL_CORE,precacheLocalAsset\)/);
  assert.match(worker,/await precacheWithBoundedConcurrency\(cache,EXTERNAL_CORE,preserveExternalRuntime\)/);
  const start=worker.indexOf('async function precacheWithBoundedConcurrency(');
  const end=worker.indexOf("self.addEventListener('install'",start);
  assert.ok(start>=0&&end>start,'bounded caching helper must exist');
  const run=vm.runInNewContext(worker.slice(start,end)+'\nprecacheWithBoundedConcurrency;');
  let active=0,maxActive=0;
  const seen=[];
  const assets=Array.from({length:38},(_,i)=>i);
  await run({},assets,async(_cache,asset)=>{
    active++;
    maxActive=Math.max(maxActive,active);
    await Promise.resolve();
    seen.push(asset);
    active--;
  });
  assert.deepEqual([...seen].sort((a,b)=>a-b),assets);
  assert.ok(maxActive<=8,'installation must limit simultaneous requests');
  assert.ok(maxActive>1,'precache should retain useful parallelism');
});
