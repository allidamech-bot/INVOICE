import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v217 protects dirty document edits during hard navigation and component departure',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  assert.match(editor,/window\.addEventListener\('beforeunload',this\.handleBeforeUnload\)/);
  assert.match(editor,/window\.addEventListener\('pagehide',this\.handlePageHide\)/);
  assert.match(editor,/event\.preventDefault\(\)/);
  assert.match(editor,/event\.returnValue=''/);
  assert.match(editor,/handleBeforeUnload=[\s\S]*this\.flushPendingSnapshot\(\)[\s\S]*event\.preventDefault\(\)/);
  assert.match(editor,/flushPendingSnapshot/);
  assert.match(editor,/this\.props\.onSave\(snapshot,true\)/);
  assert.match(editor,/componentWillUnmount\(\):void\{this\.flushPendingSnapshot\(\)/);
});

test('v217 distinguishes local queue cloud confirmation failure and conflict states',async()=>{
  const [app,shell]=await Promise.all([read('src/app/App.tsx'),read('src/components/AppShell.tsx')]);
  assert.match(app,/type CloudSyncState='local'\|'queued'\|'syncing'\|'synced'\|'offline'\|'error'\|'conflict'/);
  for(const label of ['Saved locally','Cloud pending','Syncing','Saved to cloud','Offline · Local safe','Sync failed','Sync conflict'])assert.ok(app.includes(label),label);
  assert.match(shell,/return this\.props\.cloudLabel/);
  assert.match(shell,/const detail=this\.props\.cloudMessage/);
  assert.match(shell,/title=\{detail\|\|label\}/);
  assert.match(shell,/cloud-conflict-banner/);
});

test('v217 surfaces divergence and keeps the conflict state stable until explicit recovery',async()=>{
  const [app,cloud,freshness,modal]=await Promise.all([
    read('src/app/App.tsx'),read('src/cloud/firebase.ts'),read('src/cloud/freshness.ts'),read('src/components/CloudAccountModal.tsx')
  ]);
  assert.match(freshness,/lourex-cloud-conflict/);
  assert.match(app,/window\.addEventListener\('lourex-cloud-conflict',this\.handleCloudConflict\)/);
  assert.match(app,/handleCloudConflict=[\s\S]*clearTimeout\(this\.cloudTimer\)[\s\S]*cloudSyncQueued=false/);
  assert.match(app,/if\(this\.state\.cloudSyncState==='conflict'\)return/);
  assert.match(app,/resolveCloudConflictWithLocal/);
  assert.match(app,/resolveCloudConflictWithCloud/);
  assert.match(cloud,/await publishVault\(uid,security,local,remote\)/);
  assert.match(modal,/confirmConflict:'keep-local'\|'use-cloud'/);
  assert.match(modal,/This Device Copy/);
  assert.match(modal,/Cloud Copy/);
});

test('v217 save-trust UI is loaded by the page and immutable PWA generation',async()=>{
  const [html,sw,patch,css,ci]=await Promise.all([
    read('index.html'),read('public/sw.js'),read('scripts/pwa-cache-v205.mjs'),
    read('src/styles/save-reliability-v217.css'),read('.github/workflows/ci.yml')
  ]);
  assert.match(html,/save-reliability-v217\.css/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v217'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v216'.*legacy marker/);
  assert.match(sw,/save-reliability-v217\.css/);
  assert.match(css,/\.cloud-conflict-banner/);
  assert.match(css,/\.cloud-conflict-recovery/);
  assert.doesNotMatch(css,/\.invoice-page/);
  assert.match(ci,/run-save-reliability-v217\.cjs/);
});
