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
