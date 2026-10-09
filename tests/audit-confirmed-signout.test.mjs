import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Exercise the actual subscribed Firebase watcher with virtual timers. No
// Firebase credentials, browser mocks packages or production data required.
const index=readFileSync(new URL('../src/app/index.tsx',import.meta.url),'utf8');
const stateStart=index.indexOf('let accountWasAuthenticated=false;');
const stateEnd=index.indexOf('const WORKSPACE_RESUME_KEY=',stateStart);
const watcherStart=index.indexOf('function startAccountSignOutWatcher():void');
const watcherEnd=index.indexOf('async function start():Promise<void>',watcherStart);
assert.ok(stateStart>=0&&stateEnd>stateStart&&watcherStart>=0&&watcherEnd>watcherStart);
const extracted=index.slice(stateStart,stateEnd)+'\n'+index.slice(watcherStart,watcherEnd)+
  '\nexports.start=startAccountSignOutWatcher;exports.prime=()=>{accountWasAuthenticated=true;};';
const compiled=ts.transpileModule(extracted,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;

function fixture(initialScope='A'){
  let callback,authenticatedUser={uid:'A'},selectedUid=initialScope,nextTimerId=0;
  const timers=new Map(),events=[],listeners=new Map();
  class FakeEvent{constructor(type,options){this.type=type;this.detail=options?.detail;}}
  const window={
    setTimeout(fn,delay){assert.equal(delay,2500);const id=++nextTimerId;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);},
    addEventListener(name,cb){const set=listeners.get(name)||new Set();set.add(cb);listeners.set(name,set);},
    removeEventListener(name,cb){listeners.get(name)?.delete(cb);},
    dispatchEvent(event){events.push(event);for(const listener of listeners.get(event.type)||[])listener(event);}
  };
  const context={exports:{},window,document:{documentElement:{dataset:{}}},
    CustomEvent:FakeEvent,Event:FakeEvent,
    subscribeCloudUser:cb=>{callback=cb;return()=>{};},
    currentCloudUser:()=>authenticatedUser,
    activeAccountStorageUid:()=>selectedUid,
    setActiveAccountUid:uid=>{selectedUid=uid;},
    activateAccountStorage:async uid=>{selectedUid=uid;},
  };
  vm.runInNewContext(compiled,context);
  context.exports.start();context.exports.prime();
  return {
    emit(user){authenticatedUser=user;callback(user);},
    complete(uid){selectedUid=uid;window.dispatchEvent(new FakeEvent('lourex-account-transition-complete',{detail:{uid}}));},
    flush(){const items=[...timers.values()];timers.clear();for(const fn of items)fn();},
    get pending(){return timers.size;},
    get events(){return events.filter(x=>x.type==='lourex-account-transition-request').map(x=>x.detail.uid);},
    get lost(){return context.document.documentElement.dataset.lourexCloudSessionLost;}
  };
}

test('a transient Firebase null on iOS does not sign out a restored account',()=>{
  const f=fixture();
  f.emit(null);
  assert.equal(f.pending,1,'null is observed but not immediately destructive');
  f.emit({uid:'A'});
  assert.equal(f.pending,0,'re-authentication cancels the pending sign-out');
  f.flush();
  assert.deepEqual(f.events,[]);
  assert.equal(f.lost,undefined);
});

test('confirmed Firebase sign-out requests a true account-scope transition',()=>{
  const f=fixture();
  f.emit(null);
  assert.equal(f.pending,1);
  f.flush();
  assert.deepEqual(f.events,[null]);
  assert.equal(f.lost,'true');
  f.emit(null);
  assert.equal(f.pending,0,'duplicate null must not queue a second transition');
});

test('a direct Firebase UID change forces an account transition instead of reusing the old session',()=>{
  const f=fixture();
  f.emit({uid:'B'});
  assert.deepEqual(f.events,['B']);
  assert.equal(f.pending,0);
});

test('a late Firebase login from the signed-out gateway initializes the new account UI',()=>{
  const f=fixture(null);
  f.emit({uid:'A'});
  assert.deepEqual(f.events,['A'],'public-scoped React cannot retain a stale workspace after sign-in');
});

test('rapid A to B to C account switch reconciles latest Firebase UID after B finishes',()=>{
  const f=fixture('A');
  f.emit({uid:'B'});
  assert.deepEqual(f.events,['B']);
  f.emit({uid:'C'});
  assert.deepEqual(f.events,['B'],'B transition is still draining');
  f.complete('B');
  assert.deepEqual(f.events,['B','C'],'C must not be lost when B transition ends');
});

test('sign-out during a pending account switch is still enforced after the switch',()=>{
  const f=fixture('A');
  f.emit({uid:'B'});
  f.emit(null);
  assert.deepEqual(f.events,['B']);
  f.complete('B');
  assert.equal(f.pending,1,'confirmed Firebase loss must start grace window');
  f.flush();
  assert.deepEqual(f.events,['B',null],'outgoing B workspace must be revoked');
});

test('re-login during pending sign-out reinitializes authenticated account after public scope',()=>{
  const f=fixture('A');
  f.emit(null);f.flush();
  assert.deepEqual(f.events,[null]);
  f.emit({uid:'C'});
  f.complete(null);
  assert.deepEqual(f.events,[null,'C'],'new login cannot remain on signed-out gateway');
});
