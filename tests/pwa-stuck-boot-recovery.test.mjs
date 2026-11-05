import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('startup telemetry remains data-safe with no customer recovery UI or automatic reload',async()=>{
  const [build,watchdog,sw,vercel,html]=await Promise.all([
    read('scripts/build.mjs'),read('public/startup-watchdog-v321.js'),
    read('public/sw.js'),read('vercel.json'),read('index.html')
  ]);
  assert.match(build,/await writeFile\('dist\/runtime-config\.js'/);
  assert.match(build,/window\.__LOUREX_RUNTIME__/);
  assert.match(html,/src="\.\/startup-watchdog-v321\.js\?v=348"/);
  assert.match(watchdog,/function bootStillVisible\(\)/);
  assert.match(watchdog,/window\.setTimeout\(recoverIfNeeded,CHECK_MS\)/);
  assert.doesNotMatch(watchdog,/showRecovery|lourex-startup-recovery|createElement|location\.replace|serviceWorker\.getRegistrations|caches\.delete|indexedDB\.deleteDatabase/);
  assert.match(sw,/async function networkFirst\(request\)/);
  const config=JSON.parse(vercel);
  const header=config.headers.find(x=>x.source==='/runtime-config.js');
  assert.equal(header?.headers?.find(x=>x.key==='Cache-Control')?.value,'no-cache, no-store, must-revalidate');
});

test('12-second timeout emits internal metadata only; DOM and client navigation remain unchanged',async()=>{
  const source=await read('public/startup-watchdog-v321.js');
  const tasks=[],events=[],navigation=[];
  class Element{constructor(){this.children=[];this.classList=[];}querySelector(){return null;}}
  const loading=new Element(),root=new Element(),body=new Element();
  root.querySelector=selector=>selector===':scope > .loading-screen'?loading:null;
  const document={
    body,documentElement:{hasAttribute:()=>false},
    getElementById:id=>id==='root'?root:null,
    querySelector:()=>null,visibilityState:'visible'
  };
  const window={
    setTimeout:(fn,ms)=>tasks.push({fn,ms}),
    __LOUREX_DIAGNOSTICS__:{mark:(type,detail)=>events.push({type,detail})},
    location:{replace:(url)=>navigation.push(url)}
  };
  vm.runInNewContext(source,{window,document,HTMLElement:Element,navigator:{onLine:true}});
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].ms,12000);
  tasks[0].fn();
  assert.equal(events.length,1);
  assert.equal(events[0].type,'startup-watchdog-timeout');
  assert.equal(events[0].detail,'automaticReload=no customerOverlay=no');
  assert.equal(body.children.length,0);
  assert.equal(root.children.length,0);
  assert.equal(navigation.length,0);
});

test('the watchdog skips timeouts once loading finishes or an editor is open',async()=>{
  const source=await read('public/startup-watchdog-v321.js');
  for(const mode of ['ready','editor']){
    const tasks=[],events=[];
    class Element{querySelector(){return null;}}
    const root=new Element();
    root.querySelector=selector=>mode==='editor'&&selector===':scope > .loading-screen'?new Element():null;
    const document={
      documentElement:{hasAttribute:name=>mode==='editor'&&name==='data-lourex-document-editor'},
      getElementById:id=>id==='root'?root:null,
      querySelector:()=>null
    };
    const window={setTimeout:(fn,ms)=>tasks.push(fn),__LOUREX_DIAGNOSTICS__:{mark:(type)=>events.push(type)}};
    vm.runInNewContext(source,{window,document,HTMLElement:Element,navigator:{onLine:true}});
    tasks[0]();
    assert.equal(events.length,0,mode);
  }
});
