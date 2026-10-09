import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('confirmed Settings recovery enters the explicitly allowed restore state before vault replacement',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  const restoreStart=settings.indexOf('private restoreFromCloud=async()=>');
  const restoreEnd=settings.indexOf('private signOutFromCloud=async()=>',restoreStart);
  assert.ok(restoreStart>=0&&restoreEnd>restoreStart,'Settings cloud restore handler is missing');
  const restore=settings.slice(restoreStart,restoreEnd);
  assert.match(restore,/await new Promise<void>\(resolve=>this\.setState\(\{confirmCloudRestore:false,busy:true,accountAction:'restore',[\s\S]*\},resolve\)\)/);
  assert.match(restore,/await this\.props\.onCloudRestore\(\)/);
  assert.ok(restore.indexOf("accountAction:'restore'")<restore.indexOf('await this.props.onCloudRestore()'),'restore-safe UI state must commit before cloud vault replacement starts');
  assert.match(settings,/this\.state\.accountAction==='restore'\?'is-restoring':''/);
});

test('only confirmed account restore bypasses ordinary dialog guard, never unsaved work',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const guard=cloud.slice(cloud.indexOf('function inlineDraftWorkspaceOpen'),cloud.indexOf('function splitCipher'));
  assert.match(guard,/data-lourex-document-editor/);
  assert.match(guard,/data-lourex-workspace-dirty/);
  assert.match(guard,/\.editor-screen/);
  assert.match(guard,/\.modal-backdrop/);
  assert.match(guard,/\.cloud-account-panel,\.cloud-auth-form,\.ta-settings-shell\.is-restoring/);
  assert.doesNotMatch(guard,/document\.querySelector\('\.operations-page'\)/);
  const install=cloud.slice(cloud.indexOf('export async function installCloudVault'),cloud.indexOf('export async function pushLocalVaultToCloud'));
  assert.match(install,/requireCurrentUid\(uid\)/);
  assert.match(install,/if\(inlineDraftWorkspaceOpen\(\)\)throw new Error\('Close the open editor or dialog before applying cloud account data\.'\)/);

  const compiled=ts.transpileModule(guard,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let dirty=false,editor=false,modalMode='ordinary';
  const context={document:{
    documentElement:{hasAttribute:key=>key==='data-lourex-workspace-dirty'?dirty:key==='data-lourex-document-editor'?editor:false},
    querySelector:selector=>{
      if(selector==='.editor-screen')return editor?{}:null;
      if(selector==='.modal-backdrop')return modalMode==='none'?null:{querySelector:allowed=>allowed.includes('.ta-settings-shell.is-restoring')&&modalMode==='confirmed-restore'?{}:null};
      return null;
    }
  }};
  vm.runInNewContext(compiled,context);
  const unsafe=context.inlineDraftWorkspaceOpen;
  assert.equal(unsafe(),true,'ordinary settings dialog must block cloud replacement');
  modalMode='confirmed-restore';
  assert.equal(unsafe(),false,'confirmed Settings restore must be allowed to replace verified cloud data');
  dirty=true;
  assert.equal(unsafe(),true,'unsaved business data must block even confirmed restore');
  dirty=false;
  editor=true;
  assert.equal(unsafe(),true,'document editor must block even confirmed restore');
  editor=false;
  modalMode='none';
  assert.equal(unsafe(),false,'ordinary safe browsing must not block cloud checks');
});
