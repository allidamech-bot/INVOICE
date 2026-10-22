import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/ios-print-bridge.js','utf8');
const start=source.indexOf('  const loadScript = (src, ready) => new Promise((resolve,reject) => {');
const end=source.indexOf('  const ensurePdfLibraries = async () => {',start);
assert.ok(start>=0&&end>start,'the real shipped loader must be tested');
const liveLoader=source.slice(start,end);
const src='https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';

function runtime(){
  const scripts=[];
  const timers=new Map();let timerSeq=0;
  const document={
    scripts,
    head:{appendChild(script){scripts.push(script);script.isConnected=true;}},
    createElement(tag){
      assert.equal(tag,'script');
      const handlers=new Map();
      return {
        dataset:{},src:'',isConnected:false,
        addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(fn);},
        removeEventListener(name,fn){handlers.get(name)?.delete(fn);},
        emit(name){for(const fn of [...(handlers.get(name)||[])])fn();},
        remove(){const i=scripts.indexOf(this);if(i>=0)scripts.splice(i,1);this.isConnected=false;},
        listenerCount(name){return handlers.get(name)?.size||0;}
      };
    }
  };
  const context={
    document,Promise,Error,
    setTimeout(fn){const id=++timerSeq;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);}
  };
  const load=vm.runInNewContext('(function(){'+liveLoader+'return loadScript;})()',context);
  return {load,scripts,timers,document,expire(){
    for(const [id,fn] of [...timers]){timers.delete(id);fn();}
  }};
}
test('an already initialized PDF library needs no script insertion',async()=>{
  const env=runtime();
  await env.load(src,()=>true);
  assert.equal(env.scripts.length,0);
  assert.equal(env.timers.size,0);
});
test('failed first script is removed and next Save PDF can load successfully',async()=>{
  const env=runtime();let ready=false;
  const first=env.load(src,()=>ready),stale=env.scripts[0];
  assert.equal(stale.dataset.lourexPdfLoadState,'loading');
  stale.emit('error');
  await assert.rejects(first,/Unable to load PDF library/);
  assert.equal(stale.isConnected,false);
  assert.equal(env.scripts.length,0);
  assert.equal(env.timers.size,0);
  const second=env.load(src,()=>ready),fresh=env.scripts[0];
  assert.notEqual(fresh,stale,'must create a genuinely new script');
  ready=true;fresh.emit('load');
  await second;
  assert.equal(fresh.dataset.lourexPdfLoadState,'loaded');
  assert.equal(env.timers.size,0);
});
test('a completed script without a usable library rejects, cleans up, and retries',async()=>{
  const env=runtime();
  const first=env.load(src,()=>false),bad=env.scripts[0];
  bad.emit('load');
  await assert.rejects(first,/did not initialize/);
  assert.equal(env.scripts.length,0);
  const second=env.load(src,()=>false),retry=env.scripts[0];
  retry.emit('error');
  await assert.rejects(second,/Unable to load/);
  assert.notEqual(bad,retry);
  assert.equal(env.scripts.length,0);
});
test('stalled and pre-existing scripts are bounded; a retry is never left pending',async()=>{
  const env=runtime(),foreign=env.document.createElement('script');
  foreign.src=src;env.document.head.appendChild(foreign);
  const first=env.load(src,()=>false);
  assert.equal(env.scripts.length,1,'attach to pre-existing in-progress vendor script');
  env.expire();
  await assert.rejects(first,/timed out/);
  assert.equal(env.scripts.length,0);
  assert.equal(foreign.listenerCount('load'),0);
  assert.equal(foreign.listenerCount('error'),0);
  const second=env.load(src,()=>false);
  assert.equal(env.scripts.length,1);
  env.scripts[0].emit('error');
  await assert.rejects(second,/Unable to load/);
});
test('parallel consumers settle only once without leaking pending listeners/timers',async()=>{
  const env=runtime();let loaded=false;
  const first=env.load(src,()=>loaded);
  const second=env.load(src,()=>loaded);
  assert.equal(env.scripts.length,1);
  loaded=true;
  env.scripts[0].emit('load');
  await Promise.all([first,second]);
  assert.equal(env.timers.size,0);
  assert.equal(env.scripts[0].listenerCount('load'),0);
  assert.equal(env.scripts[0].listenerCount('error'),0);
});
