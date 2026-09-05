import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('PWA activation rechecks draft safety immediately before a requested reload',async()=>{
  const entry=await read('src/app/index.tsx');
  const controller=entry.slice(entry.indexOf("navigator.serviceWorker.addEventListener('controllerchange'"),entry.indexOf('// Preserve the established non-fatal registration path'));
  assert.match(controller,/const userRequestedReload=reloadForUpdate/);
  assert.match(controller,/pendingUpdateWorker=null/);
  assert.match(controller,/if\(!userRequestedReload\)return/);
  assert.match(controller,/if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}/);
  assert.ok(controller.indexOf('reloadUnsafeWorkspaceOpen()')<controller.indexOf('window.location.replace(window.location.href)'));
  assert.match(entry,/function updateNoticeDeferredForWorkspace\(\):void[\s\S]*reload\.disabled=false/);
});

test('cloud install revalidates account ownership and workspace safety at the local commit boundary',async()=>{
  const cloud=await read('src/cloud/firebase.ts');
  const install=cloud.slice(cloud.indexOf('export async function installCloudVault'),cloud.indexOf('export async function pushLocalVaultToCloud'));
  const pull=install.indexOf('const remote=await pullCloudVaultFromMeta(uid,meta)');
  const put=install.indexOf('await putSecurityAndVault(remote.security,remote.vault)');
  assert.ok(pull>=0&&put>pull);
  const between=install.slice(pull,put);
  assert.match(between,/requireCurrentUid\(uid\)/);
  assert.match(between,/if\(inlineDraftWorkspaceOpen\(\)\)throw new Error/);
  const guard=cloud.slice(cloud.indexOf('function inlineDraftWorkspaceOpen'),cloud.indexOf('function splitCipher'));
  assert.match(guard,/\.editor-screen,\.operations-page,\.product-library-pro\.editor-open/);
  assert.match(guard,/\.modal-backdrop/);
  assert.match(guard,/\.cloud-account-panel,\.cloud-auth-form/);
});

test('manual cloud restore reloads immediately after success instead of leaving a stale UI window',async()=>{
  const modal=await read('src/components/CloudAccountModal.tsx');
  const restore=modal.slice(modal.indexOf('private restoreFromCloud=async'),modal.indexOf('render():any'));
  assert.match(restore,/await this\.props\.onRestore\(\)/);
  assert.match(restore,/window\.location\.reload\(\)/);
  assert.doesNotMatch(restore,/setTimeout[\s\S]*window\.location\.reload/);
});
