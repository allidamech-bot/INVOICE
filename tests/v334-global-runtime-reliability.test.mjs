import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('workspace dirty contract preserves actual draft work, not idle Operations navigation',async()=>{
  const source=await read('src/lib/workspace-dirty.ts');
  const ts=await import('typescript');
  const vm=await import('node:vm');
  assert.match(source,/function publishedDirtyOwnerIsActive\(\):boolean/);
  assert.match(source,/function operationsInlineMovementDraft\(\):boolean/);
  assert.match(source,/entry\.contains\(active\)/);
  assert.doesNotMatch(source,/querySelector\(['"]\.operations-page['"]\)/);
  class ElementMock {
    constructor(){this.value='';}
    contains(node){return node===this||node===focusItem;}
    querySelector(selector){return selector==='select'?focusItem:null;}
    querySelectorAll(selector){return selector.includes('inputmode')?[quantity]:[];}
  }
  const focusItem=new ElementMock(),quantity=new ElementMock(),entry=new ElementMock();
  const attributes=new Map();
  let mounted=false,entryVisible=false,active=null;
  const document={
    documentElement:{
      getAttribute:key=>attributes.get(key)||null,
      setAttribute:(key,value)=>attributes.set(key,value),
      removeAttribute:key=>attributes.delete(key)
    },
    querySelector:selector=>{
      if(selector==='.ta-inventory-entry')return entryVisible?entry:null;
      if(selector.includes('.ta-operations-page'))return mounted?{}:null;
      return null;
    },
    get activeElement(){return active;}
  };
  const context={exports:{},require:()=>({t:en=>en}),document,
    HTMLElement:ElementMock,Element:ElementMock,window:{confirm:()=>true}};
  vm.runInNewContext(ts.default.transpileModule(source,{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022}}).outputText,context);
  const dirty=context.exports.workspaceHasUnsavedChanges;
  assert.equal(dirty(),false,'idle workspace is not dirty');
  mounted=true;
  assert.equal(dirty(),false,'browsing Operations cannot block cloud refresh');
  entryVisible=true;
  focusItem.value='SKU-1';
  assert.equal(dirty(),false,'unfocused preselected inventory is not a new draft');
  active=focusItem;
  assert.equal(dirty(),true,'focused selection is an in-progress movement');
  active=null;focusItem.value='';
  quantity.value='4';
  assert.equal(dirty(),true,'entered quantity remains protected after focus leaves');
  quantity.value='';entryVisible=false;
  attributes.set('data-lourex-workspace-dirty','operations');
  assert.equal(dirty(),true,'mounted owner keeps its dirty marker');
  mounted=false;
  assert.equal(dirty(),false,'stale marker self-heals on workspace unmount');
  assert.equal(attributes.has('data-lourex-workspace-dirty'),false);
  attributes.set('data-lourex-workspace-dirty','unrecognized-plugin');
  assert.equal(dirty(),true,'unknown owners are never silently erased');
});

test('cloud freshness refuses dirty editors but permits clean Operations browsing without destructive reconcile',async()=>{
  const source=await read('src/cloud/freshness.ts');
  const guard=source.slice(source.indexOf('function appIsSafeToApply'),source.indexOf('function detachRealtime'));
  const check=source.slice(source.indexOf('async function checkCloudFreshness'),source.indexOf('export function startCloudFreshnessWatcher'));
  assert.match(source,/workspaceHasUnsavedChanges/);
  assert.match(guard,/if\(workspaceHasUnsavedChanges\(\)\)return false/);
  assert.match(guard,/document\.querySelector\(UNSAFE_SURFACE_SELECTOR\)/);
  assert.match(source,/\.editor-screen,\.modal-backdrop,\.ta-product-editor\.is-open,\.ta-operations-page \.ta-ops-editor,\.product-library-pro\.editor-open,\.operations-page \.purchase-editor/);
  assert.doesNotMatch(source,/querySelector\(['"]\.operations-page['"]\)/);
  assert.match(check,/cloudRemoteChangedSinceAnchor\(user\.uid\)/);
  assert.match(check,/lourex-cloud-refresh-available/);
  assert.doesNotMatch(check,/await (?:reconcileCloudVault|installCloudVault)\(/);
  assert.doesNotMatch(check,/window\.location\.(?:reload|replace)\(/);
});

test('Safari/PWA automatic account and update paths remain guarded against active editors',async()=>{
  const [index,runtime]=await Promise.all([read('src/app/index.tsx'),read('public/document-entry-v302.js')]);
  assert.match(index,/function reloadUnsafeWorkspaceOpen\(\):boolean/);
  assert.match(index,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{[\s\S]*Close the open editor/);
  assert.match(index,/const userRequestedReload=reloadForUpdate/);
  assert.match(index,/if\(!userRequestedReload\)return/);
  assert.match(runtime,/function editorOrUnsafeWorkspaceOpen\(\)/);
  assert.match(runtime,/if\(editorOrUnsafeWorkspaceOpen\(\)\)/);
  assert.match(runtime,/lourex-account-transition-request/);
});

test('account recovery will never overwrite a local vault or auto-reload before explicit Open',async()=>{
  const source=await read('src/app/AuthScreenSelector.tsx');
  const effect=source.slice(source.indexOf('React.useEffect'),source.indexOf("if(recoveryState==='ready')"));
  const open=source.slice(source.indexOf("if(recoveryState==='ready')"),source.indexOf('return <SetupScreen'));
  assert.match(effect,/if\(localVault\)\{diag\('auth-recovery-stage','stage=blocked-local-vault'\);setRecoveryState\('blocked'\);return;\}/);
  assert.match(effect,/cloudInstallAlreadyReloaded\(cloudUser\.uid\)/);
  assert.doesNotMatch(effect,/window\.location\.(?:reload|replace)\(/);
  assert.match(open,/markCloudInstallReload\(cloudUser\.uid\)/);
  assert.match(open,/markReload\('auth-cloud-install-user-open'\)/);
  assert.match(open,/window\.location\.reload\(\)/);
  assert.ok(open.indexOf('markCloudInstallReload(cloudUser.uid)')<open.indexOf('window.location.reload()'));
});

