import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('boot runtime is configuration-only; startup watchdog is loaded without an automatic storage reset',async()=>{
  const [build,watchdog,sw,vercel,html]=await Promise.all([
    read('scripts/build.mjs'),
    read('public/startup-watchdog-v321.js'),
    read('public/sw.js'),
    read('vercel.json'),
    read('index.html')
  ]);
  assert.match(build,/await writeFile\('dist\/runtime-config\.js'/);
  assert.match(build,/window\.__LOUREX_RUNTIME__/);
  assert.match(build,/Startup recovery must never activate a/);
  assert.match(html,/#lourex-boot\.loading-screen\{position:fixed;inset:-2px;z-index:2147483000/);
  assert.match(html,/src="\.\/runtime-config\.js"/);
  assert.match(html,/src="\.\/startup-watchdog-v321\.js/);
  assert.match(watchdog,/function bootStillVisible\(\)/);
  assert.match(watchdog,/function showRecovery\(\)/);
  assert.match(watchdog,/window\.setTimeout\(recoverIfNeeded,CHECK_MS\)/);
  assert.match(sw,/async function networkFirst\(request\)/);
  assert.match(sw,/fetch\(request,\{cache:'no-store'\}\)/);
  const config=JSON.parse(vercel);
  const header=config.headers.find(x=>x.source==='/runtime-config.js');
  assert.equal(header?.headers?.find(x=>x.key==='Cache-Control')?.value,'no-cache, no-store, must-revalidate');
});

test('stuck boot recovery is explicitly user-controlled and cannot delete the encrypted vault',async()=>{
  const watchdog=await read('public/startup-watchdog-v321.js');
  const recover=watchdog.slice(watchdog.indexOf('function recoverIfNeeded()'),watchdog.indexOf('window.setTimeout(recoverIfNeeded'));
  const show=watchdog.slice(watchdog.indexOf('function showRecovery()'),watchdog.indexOf('function recoverIfNeeded()'));
  assert.match(watchdog,/function startupSurface\(\)/);
  assert.match(watchdog,/function bootStillVisible\(\)/);
  assert.match(watchdog,/document\.documentElement\.hasAttribute\('data-lourex-workspace-dirty'\)/);
  assert.match(watchdog,/document\.documentElement\.hasAttribute\('data-lourex-document-editor'\)/);
  assert.match(show,/if\(!bootStillVisible\(\)\|\|editingWorkspaceOpen\(\)\)return/);
  assert.match(show,/Retry safely/);
  assert.match(show,/Diagnostics/);
  assert.match(watchdog,/addEventListener\('click',handler\)/);
  assert.match(show,/if\(editingWorkspaceOpen\(\)\|\|retry\.disabled\)return/);
  assert.match(show,/void refreshStaticRuntime\(\)\.finally/);
  assert.match(recover,/if\(editingWorkspaceOpen\(\)\|\|!bootStillVisible\(\)\)return/);
  assert.match(recover,/showRecovery\(\)/);
  assert.doesNotMatch(recover,/refreshStaticRuntime|window\.location\.replace|caches\.delete|indexedDB/);
  assert.doesNotMatch(watchdog,/indexedDB\.deleteDatabase|putSecurityAndVault|clearSession|deleteRecord\('vault'\)/);
});

test('12-second watchdog presents recovery options without reloading; only a user click refreshes static caches',async()=>{
  const source=await read('public/startup-watchdog-v321.js');
  const tasks=[];
  const calls={unregister:0,cacheDelete:0,replace:0};
  class Element{
    constructor(tag='div'){this.tag=tag;this.style={};this.dataset={};this.children=[];this.listeners={};this.disabled=false;}
    setAttribute(){}
    append(...nodes){this.children.push(...nodes);}
    appendChild(node){this.children.push(node);}
    replaceChildren(...nodes){this.children=[...nodes];}
    addEventListener(event,callback){this.listeners[event]=callback;}
    querySelector(){return null;}
  }
  const loading=new Element('div'),root=new Element('div');
  root.querySelector=selector=>selector===':scope > .loading-screen'?loading:null;
  const document={
    getElementById:id=>id==='root'?root:null,
    querySelector:()=>null,
    createElement:tag=>new Element(tag),
    documentElement:{dataset:{},hasAttribute:()=>false},
    visibilityState:'visible'
  };
  const caches={keys:async()=>['lourex-invoice-v314','unrelated-website'],delete:async name=>{calls.cacheDelete++;assert.equal(name,'lourex-invoice-v314');return true;}};
  const navigator={onLine:true,serviceWorker:{getRegistrations:async()=>[{unregister:async()=>{calls.unregister++;return true;}}]}};
  const window={
    setTimeout:(fn,ms)=>{tasks.push({fn,ms});return tasks.length;},
    location:{href:'https://invoice.example.test/',replace:()=>{calls.replace++;}},
    caches,
    __LOUREX_DIAGNOSTICS__:{mark:()=>{}}
  };
  vm.runInNewContext(source,{window,document,HTMLElement:Element,navigator,caches,URL});
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].ms,12000);
  assert.deepEqual(calls,{unregister:0,cacheDelete:0,replace:0});
  tasks[0].fn();
  assert.equal(loading.dataset.lourexStartupRecovery,'true');
  assert.deepEqual(calls,{unregister:0,cacheDelete:0,replace:0});
  const card=loading.children[0],actions=card?.children[2],retry=actions?.children[0];
  assert.equal(retry?.tag,'button');
  assert.equal(typeof retry?.listeners.click,'function');
  retry.listeners.click();
  for(let i=0;i<6;i++)await Promise.resolve();
  assert.deepEqual(calls,{unregister:1,cacheDelete:1,replace:1});
});
