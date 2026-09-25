import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v338 editor stability guard loads before application runtime',async()=>{
  const html=await read('index.html');
  const guard=html.indexOf('./editor-stability-v338.js?v=338');
  const entry=html.indexOf('./document-entry-v302.js?v=337-3');
  const app=html.indexOf('./src/app/index.js');
  assert.ok(guard>=0,'editor stability guard missing');
  assert.ok(entry>guard,'document runtime must load after editor stability guard');
  assert.ok(app>guard,'React app runtime must load after editor stability guard');
});

test('v338 recognizes desktop-UA iPadOS and retires service-worker update churn',async()=>{
  const runtime=await read('public/editor-stability-v338.js');
  assert.match(runtime,/platform==='MacIntel'&&touchPoints>1/);
  assert.match(runtime,/getRegistrations\(\)/);
  assert.match(runtime,/registration=>registration\.unregister\(\)/);
  assert.match(runtime,/key=>key\.startsWith\('lourex-invoice-'\)/);
  assert.match(runtime,/Object\.defineProperty\(container,'register'/);
  assert.match(runtime,/Service worker disabled for iPadOS editor stability/);
  assert.match(runtime,/window\.setTimeout\(\(\)=>void retireServiceWorkers\(\),0\)/);
  assert.match(runtime,/window\.setTimeout\(\(\)=>void retireServiceWorkers\(\),750\)/);
  assert.match(runtime,/window\.setTimeout\(\(\)=>void retireServiceWorkers\(\),2500\)/);
});

test('v338 maps real mobile text input to the existing inactivity activity channel',async()=>{
  const runtime=await read('public/editor-stability-v338.js');
  for(const event of ['beforeinput','input','compositionupdate','compositionend','paste','change'])assert.match(runtime,new RegExp(`'${event}'`));
  assert.match(runtime,/target\.closest\(editableSelector\)/);
  assert.match(runtime,/target\.closest\('\.editor-screen'\)/);
  assert.match(runtime,/window\.dispatchEvent\(new KeyboardEvent\('keydown'/);
});

test('v338 guard is editor-scoped and does not reload or navigate the application',async()=>{
  const runtime=await read('public/editor-stability-v338.js');
  assert.doesNotMatch(runtime,/location\.(?:reload|replace|assign)/);
  assert.doesNotMatch(runtime,/history\.(?:go|back|forward|pushState|replaceState)/);
  assert.match(runtime,/__LOUREX_EDITOR_STABILITY_V338__/);
});

test('startup watchdog can never auto-reload over an active editor or dirty workspace',async()=>{
  const watchdog=await read('public/startup-watchdog-v321.js');
  assert.match(watchdog,/function editingWorkspaceOpen\(\)/);
  assert.match(watchdog,/data-lourex-document-editor/);
  assert.match(watchdog,/data-lourex-workspace-dirty/);
  assert.match(watchdog,/\.editor-screen/);
  assert.match(watchdog,/if\(editingWorkspaceOpen\(\)\)\{clearAttempt\(\);return;\}/);
  assert.match(watchdog,/await refreshStaticRuntime\(\);[\s\S]*if\(editingWorkspaceOpen\(\)\)\{clearAttempt\(\);return;\}[\s\S]*window\.location\.replace\(retryUrl\(\)\)/);
});
