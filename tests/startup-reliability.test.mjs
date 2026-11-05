import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { startupCloudRead, StartupReadTimeout } from '../src/cloud/startup-read.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('restoration finishes when persistence and auth notifications never return',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const firebase=source('src/cloud/firebase.ts');
  const restoration=firebase.slice(firebase.indexOf('export async function waitForCloudUser'),firebase.indexOf('export function currentCloudUser'));
  let persistenceCalls=0,unsubscribes=0;
  const instance={
    currentUser:null,
    setPersistence(){persistenceCalls++;return new Promise(()=>{});},
    onAuthStateChanged(){return ()=>unsubscribes++;}
  };
  const wait=vm.runInNewContext(stripTypeScriptTypes(restoration.replace('export ',''))+'\nwaitForCloudUser',{
    auth:()=>instance,userFrom:user=>user,sessionStorage:{getItem:()=>null},
    window:{setTimeout,clearTimeout}
  });
  const result=wait();
  t.mock.timers.tick(5000);
  assert.equal(await result,null);
  assert.equal(persistenceCalls,0);
  assert.equal(unsubscribes,1);
});

test('blocked or silent IndexedDB opens reject and close late connections',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const db=source('src/storage/db.ts');
  const opener=db.slice(db.indexOf('function openNamedDb'),db.indexOf('async function closeActiveDb'));
  const request={result:{close(){request.closed=true;}}};
  const open=vm.runInNewContext(stripTypeScriptTypes(opener)+'\nopenNamedDb',{
    indexedDB:{open:()=>request},DB_VERSION:1,diag(){},scopeKind:()=> 'account',setTimeout,clearTimeout
  });
  const blocked=assert.rejects(open('account'),/blocked by another/);
  request.onblocked();
  await blocked;
  request.onsuccess();
  assert.equal(request.closed,true);
  const silent=assert.rejects(open('account'),/took too long/);
  t.mock.timers.tick(8000);
  await silent;
  request.closed=false;
  request.onsuccess();
  assert.equal(request.closed,true);
});

test('a late startup cloud response cannot resume reconciliation',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const read=startupCloudRead(20_000);
  let respond,used=false;
  assert.equal(await read(async()=> 'healthy'),'healthy');
  const pending=read(()=>new Promise(resolve=>{respond=resolve;})).then(()=>{used=true;});
  const timeout=assert.rejects(pending,StartupReadTimeout);
  t.mock.timers.tick(20_000);
  await timeout;
  respond('late');
  await Promise.resolve();
  assert.equal(used,false);
  await assert.rejects(read(()=>{assert.fail('expired read started');}),StartupReadTimeout);
});

test('static retry appears only while the original splash owns the root',()=>{
  const timers=[],events=new Map();
  let bootExists=true,reloads=0,click;
  const recovery={hidden:true,querySelector:()=>({addEventListener:(_,handler)=>{click=handler;}}),setAttribute(){},firstElementChild:{setAttribute(){}}};
  class HTMLElement{}
  const boot=Object.assign(new HTMLElement(),{querySelector:()=>recovery,removeAttribute(){},setAttribute(){}});
  const document={
    getElementById:id=>id==='root'?{querySelector:()=>bootExists?boot:null}:bootExists?boot:null,
    querySelector:()=>null,documentElement:{hasAttribute:()=>false}
  };
  vm.runInNewContext(source('public/startup-watchdog-v321.js'),{
    HTMLElement,document,window:{addEventListener:(name,fn)=>events.set(name,fn),setTimeout:(fn,ms)=>timers.push({fn,ms}),location:{reload:()=>reloads++}}
  });
  bootExists=false;
  timers.find(timer=>timer.ms===30000).fn();
  assert.equal(recovery.hidden,true);
  bootExists=true;
  events.get('lourex-startup-entry-failed')();
  assert.equal(recovery.hidden,false);
  assert.equal(reloads,0);
  click();
  assert.equal(reloads,1);
});
