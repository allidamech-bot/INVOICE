import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v217 cloud account link repair no longer reloads before workspace safety checks',async()=>{
  const source=await read('src/cloud/freshness.ts');
  assert.match(source,/await putCloudAccount\(user\.uid,user\.email\);\s*linked=await getCloudAccount\(\)\.catch\(\(\)=>null\);/);
  assert.doesNotMatch(source,/putCloudAccount\(user\.uid,user\.email\);window\.location\.reload\(\)/);
});

test('v217 cloud change detection defers reload and requires a safe explicit user action',async()=>{
  const [source,entry]=await Promise.all([read('src/cloud/freshness.ts'),read('src/app/index.tsx')]);
  assert.match(source,/const WORKSPACE_RESUME_KEY='lourex-auto-reload-screen'/);
  assert.match(source,/function rememberWorkspaceBeforeAutomaticReload\(\):void/);
  assert.match(source,/if\(!appIsSafeToApply\(\)\)return/);
  assert.match(source,/const remoteChanged=await cloudRemoteChangedSinceAnchor\(user\.uid\)/);
  assert.match(source,/window\.dispatchEvent\(new Event\('lourex-cloud-refresh-available'\)\)/);
  assert.doesNotMatch(source,/window\.location\.reload\(\)/,'a realtime notification must not discard local draft state');
  const handler=entry.slice(entry.indexOf('function showCloudRefreshAvailable():void'),entry.indexOf("window.addEventListener('lourex-cloud-refresh-available'",entry.indexOf('function showCloudRefreshAvailable():void')));
  assert.match(handler,/if\(reloadUnsafeWorkspaceOpen\(\)\)/);
  assert.match(handler,/rememberWorkspaceBeforeAutomaticReload\(\);\s*window\.location\.reload\(\)/);
  assert.match(handler,/data-lourex-cloud-refresh/);
});

test('v217 reopens only a recognized non-editor workspace after a safe refresh',async()=>{
  const source=await read('src/app/index.tsx');
  const match=source.match(/const RESTORABLE_WORKSPACES:RestorableWorkspace\[\]=\[([^\]]+)\]/);
  assert.ok(match,'the startup app must declare the safe workspace allowlist');
  const allowed=[...match[1].matchAll(/'([^']+)'/g)].map(item=>item[1]);
  assert.deepEqual([...allowed].sort(),['home','documents','customers','items','operations','receivables','reports'].sort());
  assert.equal(allowed.includes('editor'),false,'dirty editor content must never be re-opened by a background refresh');
  assert.match(source,/ReactDOM\.render\(<AppErrorBoundary><App\/><\/AppErrorBoundary>,appRoot\);\s*restoreWorkspaceAfterAutomaticReload\(\)/);
  assert.match(source,/if\(document\.querySelector\('\.ta-auth-page,\.auth-page'\)\)\{clearPendingWorkspace\(\);return;\}/);
  assert.match(source,/window\.addEventListener\('lourex-cloud-applied',[\s\S]*lourexCloudApplied/);
});

test('v217 explicit PWA updates also preserve the active safe workspace',async()=>{
  const source=await read('src/app/index.tsx');
  assert.match(source,/reload\.addEventListener\('click',[\s\S]*if\(reloadUnsafeWorkspaceOpen\(\)\)[\s\S]*rememberWorkspaceBeforeAutomaticReload\(\);[\s\S]*waiting\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
  assert.match(source,/controllerchange[\s\S]*if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}[\s\S]*rememberWorkspaceBeforeAutomaticReload\(\);[\s\S]*window\.location\.replace\(window\.location\.href\)/);
});
