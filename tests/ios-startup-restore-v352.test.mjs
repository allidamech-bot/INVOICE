import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read=path=>readFile(path,'utf8');

test('iOS boot surface is held during React replacement gap, then always released on real app mount',async()=>{
  const source=await read('public/theme-bootstrap-v347.js');
  let onReady,active=false,loading=true,disconnected=false,trigger;
  const root={dataset:{},style:{setProperty(){},removeProperty(){}}};
  const meta={setAttribute(){}};
  const mount={querySelector:selector=>{
    if(selector.includes('.app-ui'))return active?{}:null;
    if(selector.includes('.loading-screen'))return loading?{}:null;
    return null;
  }};
  class FakeMutationObserver{
    constructor(callback){trigger=callback;}
    observe(){}
    disconnect(){disconnected=true;}
  }
  const document={
    documentElement:root,head:{},
    querySelector:selector=>selector.includes('meta[name="theme-color"]')?meta:null,
    getElementById:id=>id==='root'?mount:null,
    addEventListener:(type,callback)=>{if(type==='DOMContentLoaded')onReady=callback;}
  };
  vm.runInNewContext(source,{document,localStorage:{getItem:()=>null},matchMedia:()=>({matches:false}),
    MutationObserver:FakeMutationObserver});
  assert.equal(root.dataset.lourexBooting,'true');
  onReady();
  assert.equal(root.dataset.lourexBooting,'true');
  loading=false;trigger([]);
  assert.equal(root.dataset.lourexBooting,'true','an empty React replacement gap must not end bootstrap');
  assert.equal(disconnected,false,'keep observing until application UI is actually mounted');
  active=true;trigger([]);
  assert.equal(root.dataset.lourexBooting,undefined,'normal documents page must not stay fixed-height/scroll-locked');
  assert.equal(disconnected,true);
});

test('startup instrumentation names only phases and does not change cloud authority ordering',async()=>{
  const [app,watchdog,entry]=await Promise.all([read('src/app/App.tsx'),read('public/startup-watchdog-v321.js'),read('src/app/index.tsx')]);
  const init=app.slice(app.indexOf('  private initialize=async()=>{'),app.indexOf('  private activity='));
  for(const phase of ['preferences-start','auth-ready','local-read-ready','cloud-reconcile-start','cloud-reconcile-ready','cloud-account-store-ready','app-ready'])
    assert.ok(init.includes("startupStage('"+phase+"')"),phase+' should be recorded');
  assert.ok(init.indexOf('await getPlainWorkspace()')<init.indexOf('await reconcilePlainCloudWorkspace(user.uid)'));
  assert.ok(init.indexOf('await reconcilePlainCloudWorkspace(user.uid)')<init.indexOf('unlocked:true,vault'));
  assert.match(watchdog,/startup-watchdog-stage/);
  assert.match(watchdog,/automaticReload=no/);
  assert.match(entry,/await resolveRequiredAccountSession\(\)/);
  assert.doesNotMatch(init,/startupStage\([^)]*uid\)|startupStage\([^)]*snapshot\)/,
    'logs cannot contain customer data, UID or raw snapshots');
});
