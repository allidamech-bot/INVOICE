import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath=new URL('../src/app/index.tsx',import.meta.url);
async function harness(){
  const source=await readFile(sourcePath,'utf8');
  const start=source.indexOf('function startPlainWorkspaceWatcher():void{');
  const end=source.indexOf('\nasync function start():Promise<void>{',start);
  assert.ok(start>=0&&end>start,'real Firebase watcher must be present');
  const compiled=ts.transpileModule(source.slice(start,end)+'\nexports.startPlainWorkspaceWatcher=startPlainWorkspaceWatcher;',{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  const listeners=new Map(),events=[];
  let firebaseUid=null,scopeUid=null,authCallback=()=>{},subscriptions=0,unsubscribes=0;
  const changeListeners=new Map();
  const win={
    addEventListener:(name,callback)=>{
      const callbacks=listeners.get(name)??[];
      callbacks.push(callback);listeners.set(name,callbacks);
    },
    dispatchEvent:event=>{
      events.push(event.type);
      for(const fn of listeners.get(event.type)??[])fn(event);
      return true;
    }
  };
  const exports={};
  vm.runInNewContext(compiled,{
    exports,window:win,Event,
    currentCloudUser:()=>firebaseUid?{uid:firebaseUid}:null,
    activeAccountStorageUid:()=>scopeUid,
    subscribeCloudUser:callback=>{authCallback=callback;callback(firebaseUid?{uid:firebaseUid}:null);return ()=>{};},
    subscribePlainCloudChanges:(uid,callback)=>{
      subscriptions++;
      changeListeners.set(uid,callback);
      return ()=>{unsubscribes++;changeListeners.delete(uid);};
    }
  });
  exports.startPlainWorkspaceWatcher();
  return {
    setAuth:uid=>{firebaseUid=uid;authCallback(uid?{uid}:null);},
    activate:uid=>{scopeUid=uid;},
    transitionDone:()=>win.dispatchEvent(new Event('lourex-account-transition-complete')),
    hydrated:()=>win.dispatchEvent(new Event('lourex-cloud-account-ready')),
    remote:uid=>changeListeners.get(uid)?.(),
    snapshot:()=>({subscriptions,unsubscribes,watched:[...changeListeners.keys()],events:[...events]})
  };
}
test('late Firebase login attaches realtime observer only AFTER IndexedDB UID activation',async()=>{
  const app=await harness();
  app.setAuth('A');
  assert.deepEqual(app.snapshot().watched,[],'auth may precede local UID activation');
  app.activate('A');
  app.transitionDone();
  assert.deepEqual(app.snapshot().watched,['A']);
  app.remote('A');
  assert.equal(app.snapshot().events.filter(x=>x==='lourex-cloud-remote-newer').length,1);
  app.hydrated();
  assert.equal(app.snapshot().subscriptions,1,'account-ready signal must not duplicate observer');
});
test('sign-out clears old UID listener; next login sees only current user updates',async()=>{
  const app=await harness();
  app.setAuth('A');app.activate('A');app.hydrated();
  app.setAuth(null);
  assert.deepEqual(app.snapshot().watched,[]);
  app.activate(null);
  app.setAuth('B');app.activate('B');app.transitionDone();
  assert.deepEqual(app.snapshot().watched,['B']);
  app.remote('A');
  assert.equal(app.snapshot().events.filter(x=>x==='lourex-cloud-remote-newer').length,0);
  app.remote('B');
  assert.equal(app.snapshot().events.filter(x=>x==='lourex-cloud-remote-newer').length,1);
  assert.ok(app.snapshot().unsubscribes>=1);
});
test('same Firebase UID can reconnect after signout without leaking duplicate subscriptions',async()=>{
  const app=await harness();
  app.setAuth('A');app.activate('A');app.transitionDone();
  app.setAuth(null);app.activate(null);
  app.setAuth('A');app.activate('A');app.hydrated();
  assert.deepEqual(app.snapshot().watched,['A']);
  assert.equal(app.snapshot().subscriptions,2);
});
