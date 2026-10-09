import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('iOS WebKit retires the unsafe independent watcher but retains guarded explicit cloud updates',async()=>{
  const [freshness,entry,cloud]=await Promise.all([
    read('src/cloud/freshness.ts'),read('src/app/index.tsx'),read('src/cloud/firebase.ts')
  ]);
  assert.match(freshness,/function appleMobileWebKit\(\):boolean/);
  assert.match(freshness,/platform==='MacIntel'&&touchPoints>1/);
  assert.match(freshness,/if\(appleMobileWebKit\(\)\)\{/);
  assert.match(freshness,/detachRealtime\(\)/);
  assert.match(freshness,/return \(\)=>undefined/);
  assert.match(entry,/if\(!iosWebKit\)startCloudFreshnessWatcher\(\)/);
  // The shared cloud remains available through explicit, non-destructive sync.
  assert.match(cloud,/export async function reconcileCloudVault\(/);
  assert.match(cloud,/export async function refreshCloudVaultForUnlock\(/);
  assert.match(freshness,/cloudRemoteChangedSinceAnchor/);
  assert.match(freshness,/if\(workspaceHasUnsavedChanges\(\)\)return false/);
  assert.match(freshness,/lourex-cloud-refresh-available/);
  assert.doesNotMatch(freshness,/window\.location\.(?:reload|replace)/);
});

test('disconnected installed app can reopen cloud account without restoring manual sync and lock controls',async()=>{
  const cloudCss=await read('src/styles/cloud.css');
  assert.match(cloudCss,/\.cloud-header-button\.cloud-local\{display:inline-flex!important\}/);
  assert.match(cloudCss,/\.header-lock-button[^\{]*\{display:none!important\}/);
  assert.match(cloudCss,/\.cloud-header-button[^\{]*\{display:none!important\}/);
});
