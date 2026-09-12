import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v217 cloud account link repair no longer reloads before workspace safety checks',async()=>{
  const source=await read('src/cloud/freshness.ts');
  assert.match(source,/await putCloudAccount\(user\.uid,user\.email\);\s*linked=await getCloudAccount\(\)\.catch\(\(\)=>null\);/);
  assert.doesNotMatch(source,/putCloudAccount\(user\.uid,user\.email\);window\.location\.reload\(\)/);
});

test('v217 automatic cloud pull remembers the current safe workspace before reload',async()=>{
  const source=await read('src/cloud/freshness.ts');
  assert.match(source,/const WORKSPACE_RESUME_KEY='lourex-auto-reload-screen'/);
  assert.match(source,/function reloadPreservingWorkspace\(\):void\{\s*rememberWorkspaceBeforeAutomaticReload\(\);\s*window\.location\.reload\(\);\s*\}/);
  assert.match(source,/if\(result==='pulled'\)reloadPreservingWorkspace\(\);/);
  assert.match(source,/\.editor-screen,\.modal-backdrop,\.operations-page,\.product-library-pro\.editor-open/);
});

test('v217 entry restores the prior non-editor workspace after a safe automatic reload',async()=>{
  const source=await read('src/app/index.tsx');
  assert.match(source,/const RESTORABLE_WORKSPACES:RestorableWorkspace\[\]=\['home','documents','customers','receivables','reports','items'\]/);
  assert.doesNotMatch(source,/RESTORABLE_WORKSPACES[^\n]*editor/);
  assert.match(source,/ReactDOM\.render\(<AppErrorBoundary><App\/><\/AppErrorBoundary>,appRoot\);\s*restoreWorkspaceAfterAutomaticReload\(\);/);
  assert.match(source,/window\.addEventListener\('lourex-cloud-applied',[\s\S]*rememberWorkspaceBeforeAutomaticReload\(\);[\s\S]*window\.location\.reload\(\);/);
  assert.match(source,/if\(document\.querySelector\('\.auth-page'\)\)\{clearPendingWorkspace\(\);return;\}/);
});

test('v217 explicit PWA updates also preserve the active safe workspace',async()=>{
  const source=await read('src/app/index.tsx');
  assert.match(source,/reload\.addEventListener\('click',[\s\S]*if\(reloadUnsafeWorkspaceOpen\(\)\)[\s\S]*rememberWorkspaceBeforeAutomaticReload\(\);[\s\S]*waiting\.postMessage\(\{type:'SKIP_WAITING'\}\)/);
  assert.match(source,/controllerchange[\s\S]*if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}[\s\S]*rememberWorkspaceBeforeAutomaticReload\(\);[\s\S]*window\.location\.replace\(window\.location\.href\)/);
});
