import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

function fixture({missingLink=false,wrongLink=false}={}){
  const source=readFileSync(new URL('../src/cloud/freshness.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source+'\nexport const checkForAudit=checkCloudFreshness;',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const attrs=new Set(),events=[],listeners={},timers=[],intervals=[],counts={account:0,remote:0,subscribe:0,unsubscribe:0,put:0};
  let user={uid:'synthetic-A',email:'audit@example.test'},dirty=false,linkWait=null,remoteWait=null;
  const navigator={onLine:true,userAgent:'Desktop'};
  class HTMLElement{};class Input extends HTMLElement{};
  const document={visibilityState:'visible',activeElement:null,documentElement:{hasAttribute:key=>attrs.has(key)},
    querySelector:()=>null,addEventListener:(name,fn)=>{listeners[name]=fn;},removeEventListener(){}};
  const firebase={currentCloudUser:()=>user,subscribeCloudVaultChanges:()=>{counts.subscribe++;return ()=>{counts.unsubscribe++;};},
    cloudRemoteChangedSinceAnchor:async()=>{counts.remote++;return remoteWait?await remoteWait:true;}};
  const db={getCloudAccount:async()=>{counts.account++;return linkWait?await linkWait:missingLink&&counts.account===1?null:{uid:wrongLink?'unrelated':user?.uid};},putCloudAccount:async()=>{counts.put++;}};
  const context={exports:{},require:name=>name.includes('firebase')?firebase:name.includes('db')?db:{workspaceHasUnsavedChanges:()=>dirty},
    navigator,document,HTMLElement,HTMLInputElement:Input,HTMLTextAreaElement:Input,HTMLSelectElement:Input,Event,
    window:{matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>{listeners[name]=fn;},removeEventListener(){},
      setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval(){},dispatchEvent:event=>events.push(event.type)}};
  vm.runInNewContext(compiled,context);const stop=context.exports.startCloudFreshnessWatcher();
  return {check:context.exports.checkForAudit,stop,attrs,events,counts,intervals,navigator,document,
    dirty:()=>{dirty=true;},switchUser:()=>{user={uid:'synthetic-B'};},delayLink(){let resolve;linkWait=new Promise(done=>{resolve=done;});return resolve;},
    delayRemote(){let resolve;remoteWait=new Promise(done=>{resolve=done;});return resolve;}};
}
test('freshness single-flight covers delayed local account lookup, not just remote fetch',async()=>{
  const f=fixture(),release=f.delayLink();const one=f.check(),two=f.check();
  assert.equal(f.counts.account,1);release({uid:'synthetic-A'});await Promise.all([one,two]);assert.equal(f.counts.remote,1);f.stop();
});
test('watcher cleanup during async lookup cannot resubscribe or query the cloud',async()=>{
  const f=fixture(),release=f.delayLink();const check=f.check();f.stop();release({uid:'synthetic-A'});await check;
  assert.equal(f.counts.subscribe,0);assert.equal(f.counts.remote,0);assert.equal(f.events.length,0);
});
test('a remote result for the previous account cannot notify the new account',async()=>{
  const f=fixture(),release=f.delayRemote();const check=f.check();await new Promise(resolve=>setImmediate(resolve));
  f.switchUser();release(true);await check;assert.equal(f.events.length,0);f.stop();
});
for(const condition of ['hidden','offline','dirty','editor'])test('freshness does not query or apply remote changes while '+condition,async()=>{
  const f=fixture();if(condition==='hidden')f.document.visibilityState='hidden';if(condition==='offline')f.navigator.onLine=false;
  if(condition==='dirty')f.dirty();if(condition==='editor')f.attrs.add('data-lourex-document-editor');
  await f.check();assert.equal(f.counts.remote,0);assert.equal(f.events.length,0);f.stop();
});
test('online safe polling only announces remote data once and uses existing five-second cadence',async()=>{
  const f=fixture();assert.equal(f.intervals[0].ms,5000);await f.check();await f.check();
  assert.equal(f.counts.remote,2);assert.deepEqual(f.events,['lourex-cloud-refresh-available']);f.stop();
});
test('notification deduplication resets for a different account',async()=>{
  const f=fixture();await f.check();f.switchUser();await f.check();
  assert.equal(f.events.length,2);assert.equal(f.counts.subscribe,2);assert.equal(f.counts.unsubscribe,1);f.stop();
});
test('watcher cleanup while remote fetch is pending suppresses its late notification',async()=>{
  const f=fixture(),release=f.delayRemote();const check=f.check();await new Promise(resolve=>setImmediate(resolve));
  f.stop();release(true);await check;assert.equal(f.events.length,0);assert.equal(f.counts.unsubscribe,1);
});
test('a missing link is repaired for the current account without reloading',async()=>{
  const f=fixture({missingLink:true});await f.check();assert.equal(f.counts.put,1);assert.equal(f.counts.account,2);
  assert.equal(f.counts.remote,1);assert.deepEqual(f.events,['lourex-cloud-refresh-available']);f.stop();
});
test('a link to a different account blocks repair, subscription and remote reads',async()=>{
  const f=fixture({wrongLink:true});await f.check();assert.equal(f.counts.put,0);assert.equal(f.counts.subscribe,0);assert.equal(f.counts.remote,0);f.stop();
});
