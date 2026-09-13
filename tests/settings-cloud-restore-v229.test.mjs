import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v229 confirmed Settings recovery becomes an explicitly safe cloud surface before vault replacement',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  const restoreStart=settings.indexOf('private restoreFromCloud=async()=>');
  const restoreEnd=settings.indexOf('private signOutFromCloud=async()=>',restoreStart);
  assert.ok(restoreStart>=0&&restoreEnd>restoreStart,'Settings cloud restore handler is missing');
  const restore=settings.slice(restoreStart,restoreEnd);
  assert.match(restore,/await new Promise<void>\(resolve=>this\.setState\(\{confirmCloudRestore:false,busy:true,accountAction:'restore',[\s\S]*\},resolve\)\)/);
  assert.match(restore,/await this\.props\.onCloudRestore\(\)/);
  assert.ok(restore.indexOf("accountAction:'restore'")<restore.indexOf('await this.props.onCloudRestore()'),'restore-safe UI state must commit before cloud vault replacement starts');
  assert.match(settings,/this\.state\.accountAction==='restore'\?'cloud-account-panel':''/);
});

test('v229 keeps automatic cloud replacement blocked behind ordinary editors and dialogs',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const guard=cloud.slice(cloud.indexOf('function inlineDraftWorkspaceOpen'),cloud.indexOf('function splitCipher'));
  assert.match(guard,/\.editor-screen,\.operations-page,\.product-library-pro\.editor-open/);
  assert.match(guard,/\.modal-backdrop/);
  assert.match(guard,/\.cloud-account-panel,\.cloud-auth-form/);
  assert.match(cloud,/installCloudVault[\s\S]*if\(inlineDraftWorkspaceOpen\(\)\)throw new Error\('Close the open editor or dialog before applying cloud account data\.'\)/);
});