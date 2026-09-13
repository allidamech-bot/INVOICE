import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v235 extends BaseApp cloud replacement guard to every unsafe data-entry workspace',async()=>{
  const [entry,app]=await Promise.all([
    read('src/app/index.tsx'),
    read('src/app/App.tsx')
  ]);

  assert.match(entry,/class AdaptiveCloudApp extends BaseApp/);
  assert.match(entry,/instance\.cloudReplaceBlocked=\(\)=>instance\.state\.screen==='editor'\|\|instance\.state\.settingsOpen\|\|instance\.state\.cloudModal\|\|reloadUnsafeWorkspaceOpen\(\)/);
  assert.match(entry,/function reloadUnsafeWorkspaceOpen\(\):boolean\{[\s\S]*\.operations-page,\.product-library-pro\.editor-open,\.modal-backdrop/);

  const remoteBranch=app.indexOf("if(remoteChanged){");
  const firstGuard=app.indexOf("if(this.cloudReplaceBlocked()){this.deferRemoteCloud();return;}",remoteBranch);
  const protectedStart=app.indexOf('await this.beginProtectedOperation();',remoteBranch);
  const secondGuard=app.indexOf("if(this.cloudReplaceBlocked()){this.deferRemoteCloud();return;}",firstGuard+1);
  const reconcile=app.indexOf('const result=await reconcileCloudVault(user.uid);',protectedStart);
  assert.ok(remoteBranch>=0&&firstGuard>remoteBranch&&protectedStart>firstGuard,'remote cloud replacement must be blocked before protected replacement starts');
  assert.ok(secondGuard>protectedStart&&reconcile>secondGuard,'unsafe workspace must be re-checked immediately before remote reconciliation');
});

test('v235 keeps automatic applied-cloud and PWA update reloads on the same unsafe-workspace guard',async()=>{
  const entry=await read('src/app/index.tsx');
  assert.match(entry,/lourex-cloud-applied[\s\S]*if\(reloadUnsafeWorkspaceOpen\(\)\)return/);
  assert.match(entry,/reload\.addEventListener\('click',[\s\S]*if\(reloadUnsafeWorkspaceOpen\(\)\)/);
  assert.match(entry,/controllerchange[\s\S]*if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}/);
});

test('v235 refreshes installed clients for the cloud replacement safety guard',async()=>{
  const pwa=await read('scripts/pwa-cache-v205.mjs');
  assert.match(pwa,/v235 blocks automatic remote-cloud replacement while an unsafe data-entry workspace is open/);
  assert.match(pwa,/lourex-invoice-v235: guarded cloud replacement refresh/);
});
