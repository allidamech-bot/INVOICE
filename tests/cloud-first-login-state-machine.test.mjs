import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const src=new URL('../src/app/App.tsx',import.meta.url);
async function factory({initialUid='A',storageUid='A',unlocked=false,linked=false,firstRun=true}={}){
  const source=await readFile(src,'utf8');
  const a=source.indexOf('  private attachCloudUser=async(');
  const b=source.indexOf('  private cloudSignIn=async(',a+1);
  assert.ok(a>0&&b>a);
  const snippet=source.slice(a,b);
  const script=`class Fixture {
    constructor(){
      this.state={loading:false,unlocked:${unlocked},firstRun:${firstRun},
        cloudLinked:${linked},vault:${unlocked?'{documents:[]}':'null'},cloudUser:null};
      this.initializations=0;
      this.immediateSyncs=0;
    }
    setState(next,done){this.state={...this.state,...next};done?.();}
    async initialize(){
      this.initializations++;
      if(currentCloudUser()?.uid!==this.state.cloudUser?.uid)throw Error('UID changed');
      this.setState({loading:false,firstRun:false,unlocked:true,
        vault:{documents:[]},cloudLinked:true,cloudSyncMessage:''});
    }
    async cloudSyncNow(){this.immediateSyncs++;}
    ${snippet}
  }
  exports.Fixture=Fixture;`;
  const emitted=ts.transpileModule(script,{compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
  }}).outputText;
  let activeStorage=storageUid,currentUid=initialUid;
  let activationCount=0;
  const exports={};
  vm.runInNewContext(emitted,{
    exports,Error,Promise,
    currentCloudUser:()=>currentUid?{uid:currentUid}:null,
    activeAccountStorageUid:()=>activeStorage,
    setActiveAccountUid:uid=>{activeStorage=uid;},
    activateAccountStorage:async uid=>{activeStorage=uid;activationCount++;},
    putCloudAccount:async()=>{}
  });
  const instance=new exports.Fixture();
  return {instance,login:uid=>instance.attachCloudUser({uid,email:uid+'@example.test'}),
    counts:()=>({activationCount,activeStorage})};
}
test('real compiled login handler opens cached same UID after deliberate sign-out',async()=>{
  const x=await factory({initialUid:'A',storageUid:'A',unlocked:false,firstRun:true});
  await x.login('A');
  assert.equal(x.instance.initializations,1);
  assert.equal(x.instance.immediateSyncs,0,'cannot sync an uninitialized public login screen');
  assert.equal(x.instance.state.unlocked,true);
  assert.equal(x.instance.state.firstRun,false);
  assert.equal(x.counts().activationCount,0,'same UID does not need to switch database');
});
test('real compiled login handler reopens another UID only after selecting its IndexedDB scope',async()=>{
  const x=await factory({initialUid:'B',storageUid:'A',unlocked:true,linked:true,firstRun:false});
  await x.login('B');
  assert.equal(x.counts().activeStorage,'B');
  assert.equal(x.counts().activationCount,1);
  assert.equal(x.instance.initializations,1);
  assert.equal(x.instance.state.unlocked,true);
});
test('already hydrated current account reconciles without rerunning first-login bootstrap',async()=>{
  const x=await factory({initialUid:'A',storageUid:'A',unlocked:true,linked:true,firstRun:false});
  await x.login('A');
  assert.equal(x.instance.initializations,0);
  assert.equal(x.instance.immediateSyncs,1);
});
test('wrong Firebase identity can never open cached data',async()=>{
  const x=await factory({initialUid:'B',storageUid:'A',unlocked:false,firstRun:true});
  await assert.rejects(x.login('A'),/Account identity changed/);
  assert.equal(x.instance.initializations,0);
});
