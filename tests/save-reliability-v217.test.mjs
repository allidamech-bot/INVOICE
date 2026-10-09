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

test('save status distinguishes local, queued, offline, server-confirmed and conflict without an actionable sync badge',async()=>{
  const [app,shell]=await Promise.all([read('src/app/App.tsx'),read('src/components/AppShell.tsx')]);
  assert.match(app,/type CloudSyncState='local'\|'queued'\|'syncing'\|'synced'\|'offline'\|'error'\|'conflict'/);
  const label=app.slice(app.indexOf('private cloudHeaderLabel='),app.indexOf('private openCreditNoteLauncher='));
  for(const expected of ['Saved locally','Cloud pending','Syncing','Saved to cloud','Offline · Local safe','Sync failed','Sync conflict'])assert.ok(label.includes(expected),expected);
  const status=shell.slice(shell.indexOf('private syncStatus='),shell.indexOf('private conflictBanner='));
  assert.match(status,/const label=this\.props\.cloudLabel/);
  assert.match(status,/const detail=this\.props\.cloudMessage/);
  assert.match(status,/role="status" aria-live="polite"/);
  assert.match(status,/title=\{detail\|\|label\}/);
  assert.doesNotMatch(status,/onClick=/,'save status remains passive rather than implying a cloud operation');
  const conflict=shell.slice(shell.indexOf('private conflictBanner='),shell.indexOf('render():any'));
  assert.match(conflict,/cloudState==='conflict'/);
  assert.match(conflict,/className="ta-conflict-banner" role="alert"/);
  assert.match(conflict,/onClick=\{this\.props\.onCloud\}/);
});

test('cloud divergence is blocked from background overwrite and requires confirmation before either recovery choice',async()=>{
  const [app,cloud,freshness,modal]=await Promise.all([
    read('src/app/App.tsx'),read('src/cloud/firebase.ts'),
    read('src/cloud/freshness.ts'),read('src/components/CloudAccountModal.tsx')
  ]);
  assert.match(app,/window\.addEventListener\('lourex-cloud-conflict',this\.handleCloudConflict\)/);
  const conflict=app.slice(app.indexOf('private handleCloudConflict='),app.indexOf('private announceRemoteCloudUpdate='));
  assert.match(conflict,/clearTimeout\(this\.cloudTimer\)/);
  assert.match(conflict,/this\.cloudSyncQueued=false/);
  assert.match(conflict,/cloudSyncState:'conflict'/);
  const flush=app.slice(app.indexOf('private flushCloudSync='),app.indexOf('private attachCloudUser=')>0?app.indexOf('private attachCloudUser='):app.indexOf('private cloudSignIn='));
  assert.match(flush,/if\(this\.state\.cloudSyncState==='conflict'\)return/);
  assert.match(flush,/if\(result==='remote-changed'\)\{this\.announceRemoteCloudUpdate\(\);return;\}/);
  const push=cloud.slice(cloud.indexOf('export async function pushLocalVaultToCloud'),cloud.indexOf('// Compatibility exports'));
  assert.match(push,/if\(!anchor\)return 'remote-changed'/);
  assert.match(push,/if\(remoteChanged\)return 'remote-changed'/);
  assert.doesNotMatch(push,/installCloudVault/);
  assert.match(cloud,/await publishVault\(uid,security,local,remote\)/);
  assert.doesNotMatch(freshness,/await (?:installCloudVault|reconcileCloudVault)\(/);
  assert.match(modal,/confirmConflict:'keep-local'\|'use-cloud'\|''/);
  assert.match(modal,/if\(this\.props\.cloudState!=='conflict'\)/);
  assert.match(modal,/Keep This Device Copy/);
  assert.match(modal,/Use Cloud Copy/);
  assert.match(modal,/this\.setState\(\{confirmConflict:'keep-local'\}\)/);
  assert.match(modal,/this\.setState\(\{confirmConflict:'use-cloud'\}\)/);
  assert.match(modal,/Confirm choice/);
  assert.match(modal,/if\(choice==='keep-local'\)await this\.props\.onKeepLocal\(\);else await this\.props\.onRestore\(\)/);
});

test('current save status and cloud-conflict UI remain bundled offline, without reviving retired standalone layers',async()=>{
  const [html,sw,build,css,modal,appShell]=await Promise.all([
    read('index.html'),read('public/sw.js'),read('scripts/build.mjs'),
    read('src/styles/tailadmin-shell-v320.css'),
    read('src/components/CloudAccountModal.tsx'),read('src/components/AppShell.tsx')
  ]);
  assert.match(html,/href="\.\/styles\/tailadmin-shell-v320\.css/);
  assert.match(html,/runtime-safety-v334\.js/);
  assert.match(sw,/v217 save reliability/);
  assert.match(sw,/save-reliability-v217\.css/);
  assert.match(build,/await writeFile\('dist\/styles\/app\.bundle\.css',appBundleCss\)/);
  assert.match(build,/replace\([^;\n]*app\.bundle\.css/);
  assert.match(css,/\.ta-conflict-banner/);
  assert.match(css,/\.ta-status-dot/);
  assert.match(modal,/className="ta-cloud-conflict" role="alert"/);
  assert.match(appShell,/className="ta-conflict-banner" role="alert"/);
  assert.doesNotMatch(css,/\.invoice-page/,'cloud status styling must not alter the A4 invoice layer');
});

