import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the same handler shipped by the UI, with IndexedDB/session actions
// replaced by instrumented promises. This is a real behavior test, not a source
// regex or an expected CSS string.
const source=readFileSync(new URL('../src/app/App.tsx',import.meta.url),'utf8');
const start=source.indexOf('private handleAccountTransitionRequest=');
const end=source.indexOf('private handleOnline=',start);
assert.ok(start>0&&end>start,'account transition handler is required');
const body='class TestApp { accountTransitionRunning=false; cloudTimer=undefined; '+
  'cloudSyncQueued=true; latestEncryptedVault={cipher:"old"}; '+
  'vaultWriteTail=Promise.resolve({old:true}); state={unlocked:true,key:"OLD_KEY",vault:{sensitive:true}}; '+
  'constructor(log){this.log=log;} '+
  'drainVaultWrites=async()=>{this.log.push("drain");}; '+
  'waitForCloudIdle=async()=>{this.log.push("idle");}; '+
  'initialize=async()=>{this.log.push("initialize");}; '+
  'setState=(next,done)=>{this.state={...this.state,...next};this.log.push("ui-locked");done?.();}; '+
  source.slice(start,end)+' } exports.TestApp=TestApp;';
const compiled=ts.transpileModule(body,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

function fixture({rejectSwitch=false,holdDrain=false}={}){
  const log=[];
  let resolveCompletion;
  const completed=new Promise(resolve=>resolveCompletion=resolve);
  class TestEvent{constructor(type,options){this.type=type;this.detail=options?.detail;}}
  const context={exports:{},CustomEvent:TestEvent,
    window:{dispatchEvent(e){log.push('completed');resolveCompletion(e);}},
    suspendSession:async()=>log.push('suspend'),
    setActiveAccountUid:uid=>log.push('uid:'+String(uid)),
    activateAccountStorage:async uid=>{
      log.push('scope:'+String(uid));
      if(rejectSwitch)throw new Error('storage rejected');
    },
    friendlyCloudError:error=>error.message
  };
  vm.runInNewContext(compiled,context);
  const app=new context.exports.TestApp(log);
  let releaseDrain=()=>{};
  if(holdDrain){
    let release;
    const drainGate=new Promise(resolve=>{release=resolve;});
    app.drainVaultWrites=async()=>{log.push('drain');await drainGate;};
    releaseDrain=()=>release();
  }
  return {app,log,completed,Event:TestEvent,releaseDrain};
}

test('confirmed sign-out releases old CryptoKey before switching to public DB and clears decrypted UI',async()=>{
  const f=fixture();
  f.app.handleAccountTransitionRequest(new f.Event('transition',{detail:{uid:null}}));
  const done=await f.completed;
  assert.equal(done.detail.uid,null);
  assert.equal(f.app.state.unlocked,false);
  assert.equal(f.app.state.key,null);
  assert.equal(f.app.state.vault,null);
  const a=f.log.indexOf('drain'),b=f.log.indexOf('suspend'),c=f.log.indexOf('uid:null'),d=f.log.indexOf('scope:null');
  assert.ok(a>=0&&b>a&&c>b&&d>c,'save drain → key revocation → UID clear → DB switch');
  assert.ok(f.log.indexOf('initialize')>d,'signed-out screen is reinitialized');
});

test('switching from A to B cannot reuse A PIN or A decrypted vault',async()=>{
  const f=fixture();
  f.app.handleAccountTransitionRequest(new f.Event('transition',{detail:{uid:'account-B'}}));
  await f.completed;
  assert.equal(f.app.state.unlocked,false);
  assert.equal(f.app.state.key,null);
  assert.equal(f.app.state.vault,null);
  assert.ok(f.log.indexOf('suspend')<f.log.indexOf('uid:account-B'));
  assert.ok(f.log.indexOf('uid:account-B')<f.log.indexOf('scope:account-B'));
  assert.ok(f.log.indexOf('scope:account-B')<f.log.indexOf('initialize'));
});

test('a failed storage switch fails closed and cannot show the old account',async()=>{
  const f=fixture({rejectSwitch:true});
  f.app.handleAccountTransitionRequest(new f.Event('transition',{detail:{uid:'account-B'}}));
  await f.completed;
  assert.equal(f.app.state.unlocked,false);
  assert.equal(f.app.state.key,null);
  assert.equal(f.app.state.vault,null);
  assert.equal(f.app.state.cloudSyncState,'error');
  assert.ok(f.log.filter(x=>x==='suspend').length>=2,'session revoked again on failure');
  assert.ok(!f.log.includes('initialize'),'must not initialize a different account after failed isolation');
});


test('account switch masks decrypted workspace immediately while old cloud writes finish',async()=>{
  const f=fixture({holdDrain:true});
  f.app.handleAccountTransitionRequest(new f.Event('transition',{detail:{uid:'account-B'}}));
  assert.equal(f.app.state.loading,true,'account data must be hidden before any asynchronous drain');
  assert.equal(f.app.state.unlocked,true,'key remains available only to finish queued writes before revocation');
  assert.ok(!f.log.includes('uid:account-B'),'cannot change IndexedDB scope while old writes are pending');
  assert.match(source,/if\(this\.state\.loading\)return <div className="loading-screen"/,
    'loading state must render without business or account data');
  f.releaseDrain();
  await f.completed;
  assert.equal(f.app.state.unlocked,false);
  assert.equal(f.app.state.key,null);
  assert.equal(f.app.state.vault,null);
  assert.ok(f.log.indexOf('suspend')<f.log.indexOf('uid:account-B'));
});
