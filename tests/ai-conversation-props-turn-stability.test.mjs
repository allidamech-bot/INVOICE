import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source=await readFile(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8');
const start=source.indexOf('export function updateConversationWorkspace(');
const end=source.indexOf('export function unmountConversationWorkspace(',start);
assert.ok(start>=0&&end>start,'actual production workspace update hook must exist');
const transpiled=ts.transpileModule(source.slice(start,end),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;

function fixture(){
  let activeUid='account-a',viewportSyncs=0,presentationClears=0;
  const exports={};
  vm.runInNewContext(transpiled,{
    exports,
    syncWorkspaceViewport:()=>{viewportSyncs++;},
    activeAccountStorageUid:()=>activeUid,
    clearConversationToolPresentation:()=>{presentationClears++;}
  });
  const initialProps={screen:'home',language:'ar',activeDocument:{id:'doc-1'},onNavigate:()=>{}};
  const kernel={scope:{scope:'business',accountId:'account-a',workspaceId:'company-a',branchId:'main',threadId:'advisor-1'},mode:'advisor'};
  const vault={appSettings:{activeWorkspaceId:'company-a',activeBranchId:'main'}};
  let draftClear=0,cacheClear=0,refreshes=0;
  const host={
    props:initialProps,__workspaceObservedProps:initialProps,__intelligenceKernel:kernel,
    __foundationVault:vault,__workspaceLoadGeneration:8,__businessMemories:['safe'],__businessThreads:['safe'],
    __workspaceComposerDrafts:{clear(){draftClear++;}},
    __workspaceReadyModeCache:{clear(){cacheClear++;}},
    __workspaceRefresh(){refreshes++;this.__workspaceLoadGeneration++;}
  };
  return {host,kernel,vault,initialProps,
    update:previous=>exports.updateConversationWorkspace(host,previous),
    setUid:next=>{activeUid=next;},
    stats:()=>({refreshes,draftClear,cacheClear,viewportSyncs,presentationClears})};
}

test('a new onNavigate closure during an Advisor request must NOT cancel a verified turn',()=>{
  const f=fixture();
  const owner={kernel:f.host.__intelligenceKernel,generation:f.host.__workspaceLoadGeneration};
  const previous=f.host.props;
  f.host.props={...previous,onNavigate:()=>{}};
  f.update(previous);
  assert.equal(f.host.__intelligenceKernel,owner.kernel);
  assert.equal(f.host.__workspaceLoadGeneration,owner.generation);
  assert.equal(f.host.__foundationVault,f.vault);
  assert.equal(f.host.__workspaceObservedProps,f.host.props);
  assert.deepEqual(f.stats(),{refreshes:0,draftClear:0,cacheClear:0,viewportSyncs:1,presentationClears:0});
  const second=f.host.props;
  f.host.props={...second,activeDocument:{id:'doc-1'},onNavigate:()=>{}};
  f.update(second);
  assert.equal(f.host.__workspaceLoadGeneration,owner.generation);
  assert.equal(f.host.__intelligenceKernel,owner.kernel);
  assert.equal(f.stats().refreshes,0);
});

test('a new callback while the scope is still hydrating cannot manufacture ready state',()=>{
  const f=fixture();
  f.host.__workspaceObservedProps=undefined;
  const before=f.host.props;
  f.host.props={...before,onNavigate:()=>{}};
  f.update(before);
  assert.equal(f.host.__workspaceObservedProps,undefined);
  assert.equal(f.stats().refreshes,0);
});

test('real screen, language, or document identity change invalidates old reply and cached modes',()=>{
  for(const change of [
    {screen:'documents'}, {language:'en'}, {activeDocument:{id:'doc-2'}}
  ]){
    const f=fixture();
    const before=f.host.props;
    f.host.props={...before,...change};
    f.update(before);
    assert.equal(f.stats().refreshes,1,JSON.stringify(change));
    assert.equal(f.stats().cacheClear,1);
    assert.equal(f.stats().draftClear,1);
    assert.equal(f.host.__workspaceObservedProps,undefined);
    assert.equal(f.host.__foundationVault,undefined);
    assert.equal(f.host.__workspaceLoadGeneration,9);
  }
});

test('UID, company and branch changes still revoke cached Advisor/Controller scope',()=>{
  for(const change of ['uid','company','branch']){
    const f=fixture();
    if(change==='uid')f.setUid('account-b');
    if(change==='company')f.vault.appSettings.activeWorkspaceId='company-b';
    if(change==='branch')f.vault.appSettings.activeBranchId='branch-b';
    const before=f.host.props;
    f.host.props={...before,onNavigate:()=>{}};
    f.update(before);
    assert.equal(f.stats().refreshes,1,change);
    assert.equal(f.stats().cacheClear,1,change);
    assert.equal(f.host.__foundationVault,undefined);
    assert.equal(f.host.__workspaceObservedProps,undefined);
  }
});
