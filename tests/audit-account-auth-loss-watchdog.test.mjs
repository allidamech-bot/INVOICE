import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const index=await readFile(new URL('../src/app/index.tsx',import.meta.url),'utf8');
const app=await readFile(new URL('../src/app/App.tsx',import.meta.url),'utf8');

function compile(source){
  return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
}
function sliceRequired(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Production auth transition owner must exist: '+start);
  return source.slice(a,b);
}
const authStateCode=sliceRequired(index,'let accountWasAuthenticated=false;','const WORKSPACE_RESUME_KEY=');
const watcherCode=sliceRequired(index,'function startAccountSignOutWatcher():void{','async function start():Promise<void>{');
const transitionCode=sliceRequired(app,'private handleAccountTransitionRequest=(event:Event)=>{','  private handleOnline=');

function watcherHarness(){
  const events=[],timers=new Map(),listeners=new Map();
  let emitted=null,uid='account-a',cloudUser={uid},nextId=0;
  const window={
    setTimeout(callback){const id=++nextId;timers.set(id,callback);return id;},
    clearTimeout(id){timers.delete(id);},
    addEventListener(name,fn){listeners.set(name,fn);},
    removeEventListener(name){listeners.delete(name);},
    dispatchEvent(event){events.push(event);listeners.get(event.type)?.(event);}
  };
  class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}
  class Event{constructor(type){this.type=type;}}
  const program=[
    authStateCode,
    watcherCode,
    'accountWasAuthenticated=true;',
    'startAccountSignOutWatcher();'
  ].join('\n');
  runInNewContext(compile(program),{
    subscribeCloudUser(fn){emitted=fn;},
    currentCloudUser:()=>cloudUser,
    activeAccountStorageUid:()=>uid,
    setActiveAccountUid(value){uid=value;},
    activateAccountStorage:async()=>{},
    document:{documentElement:{dataset:{}}},
    window,CustomEvent,Event
  });
  assert.equal(typeof emitted,'function');
  return{
    events,timers,
    emit(user){cloudUser=user;emitted(user);},
    tick(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());}
  };
}

test('transient Safari auth null does not revoke an authenticated account',()=>{
  const app=watcherHarness();
  app.emit(null);
  assert.equal(app.timers.size,1,'null starts a bounded grace timer');
  app.emit({uid:'account-a'});
  assert.equal(app.timers.size,0,'restored identity cancels the grace timer');
  app.tick();
  assert.equal(app.events.filter(e=>e.type==='lourex-account-transition-request').length,0);
});

test('sustained Firebase auth loss requests a real workspace lock, only once',()=>{
  const app=watcherHarness();
  app.emit(null);
  app.emit(null);
  assert.equal(app.timers.size,1,'repeated null callbacks do not start duplicate timers');
  app.tick();
  const requests=app.events.filter(e=>e.type==='lourex-account-transition-request');
  assert.equal(requests.length,1);
  assert.equal(requests[0].detail.uid,null,'explicit confirmed sign-out must use the current null UID contract');
  assert.equal(requests[0].detail.signedOut,undefined,'current transition contract uses null, not a legacy signedOut flag');
  app.emit(null);
  assert.equal(app.timers.size,0,'transition in progress is not reissued');
});

test('account UID replacement always uses the coordinated session transition',()=>{
  const app=watcherHarness();
  app.emit({uid:'account-b'});
  const requests=app.events.filter(e=>e.type==='lourex-account-transition-request');
  assert.equal(requests.length,1);
  assert.equal(requests[0].detail.uid,'account-b');
  assert.equal(requests[0].detail.signedOut,undefined);
});

async function transitionHarness({signedOut=true,failDrain=false}={}){
  const actions=[];
  let completed;
  const done=new Promise(resolve=>{completed=resolve;});
  class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}
  const program=[
    'class MockApp {',
    'accountTransitionRunning=false;',
    'cloudTimer=undefined;',
    'cloudSyncQueued=false;',
    'latestEncryptedVault={cipher:"protected"};',
    'vaultWriteTail=Promise.resolve({secret:"protected"});',
    'state={unlocked:true,vault:{secret:"protected"},key:"key"};',
    'async drainVaultWrites(){actions.push("drain");if(failDrain)throw new Error("disk fault");}',
    'async waitForCloudIdle(){actions.push("cloud-idle");}',
    'setState(next,callback){this.state={...this.state,...next};actions.push("lock-ui");callback?.();}',
    'async initialize(){actions.push("initialize");}',
    transitionCode,
    '}',
    'MockApp;'
  ].join('\n');
  const MockApp=runInNewContext(compile(program),{
    actions,failDrain,
    suspendSession:async()=>{actions.push('revoke-key');},
    setActiveAccountUid:uid=>{actions.push('uid:'+String(uid));},
    activateAccountStorage:async uid=>{actions.push('storage:'+String(uid));},
    friendlyCloudError:()=> 'Session transition failed',
    sessionStorage:{setItem(k,v){actions.push('session-flag:'+k+':'+v);}},
    window:{
      clearTimeout:()=>{},
      location:{reload(){actions.push('reload');}},
      dispatchEvent(event){if(event.type==='lourex-account-transition-complete')completed();}
    },
    CustomEvent
  });
  const subject=new MockApp();
  subject.handleAccountTransitionRequest(new CustomEvent('lourex-account-transition-request',{
    detail:signedOut?{uid:null}:{uid:'account-b'}
  }));
  await done;
  return{actions,subject};
}

test('persistent sign-out revokes the old PIN key, clears account storage and reloads to auth gateway',async()=>{
  const {actions,subject}=await transitionHarness();
  assert.ok(actions.indexOf('revoke-key')<actions.indexOf('storage:null'));
  assert.ok(actions.includes('uid:null'));
  assert.ok(actions.includes('storage:null'));
  assert.ok(actions.includes('reload'));
  assert.equal(actions.includes('initialize'),true,'reinitialize the locked account gateway after revocation');
  assert.equal(subject.state.key,null);
  assert.equal(subject.state.vault,null);
  assert.equal(subject.state.unlocked,false);
});

test('a failed cloud write still revokes session access on confirmed sign-out',async()=>{
  const {actions,subject}=await transitionHarness({failDrain:true});
  assert.ok(actions.includes('revoke-key'),'finally must revoke even after rejected writes');
  // A failed write must never migrate an in-flight encrypted vault into a new
  // storage scope; remain fail-closed with the former CryptoKey revoked.
  assert.ok(!actions.includes('storage:account-b'));
  assert.equal(subject.state.unlocked,false);
  assert.equal(subject.state.key,null);
});

test('switching accounts locks old decrypted data but does not reload',async()=>{
  const {actions,subject}=await transitionHarness({signedOut:false});
  assert.ok(actions.indexOf('revoke-key')<actions.indexOf('storage:account-b'));
  assert.ok(actions.includes('initialize'));
  assert.ok(!actions.includes('reload'));
  assert.equal(subject.state.unlocked,false);
  assert.equal(subject.state.vault,null);
});
