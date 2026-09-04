import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('iOS standalone aggressively resumes cloud freshness',async()=>{
  const freshness=await read('src/cloud/freshness.ts');
  assert.match(freshness,/matchMedia\?\.\('\(display-mode: standalone\)'\)/);
  assert.match(freshness,/navigator as Navigator&\{standalone\?:boolean\}/);
  assert.match(freshness,/pageshow/);
  assert.match(freshness,/visibilitychange/);
  assert.match(freshness,/focus/);
  assert.match(freshness,/cloudRemoteChangedSinceAnchor/);
  assert.match(freshness,/reconcileCloudVault/);
  assert.match(freshness,/standalone\?1_500:5_000/);
  assert.match(freshness,/if\(isStandalonePwa\(\)\)schedule\(600\)/);
});

test('disconnected installed app can reopen cloud account without restoring manual sync and lock controls',async()=>{
  const cloudCss=await read('src/styles/cloud.css');
  assert.match(cloudCss,/\.cloud-header-button\.cloud-local\{display:inline-flex!important\}/);
  assert.match(cloudCss,/\.header-lock-button[^\{]*\{display:none!important\}/);
  assert.match(cloudCss,/\.cloud-header-button[^\{]*\{display:none!important\}/);
});
