import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('v519 keeps active quotation editing on lightweight checkpoints',async()=>{
  const runtime=await readFile('dist/src/app/index.js','utf8');
  assert.ok(runtime.includes("const editorActivityEvents=['input','beforeinput','compositionstart','compositionend'];"),'mobile keyboard input must count as activity');
  assert.ok(runtime.includes('for(const eventName of editorActivityEvents)window.addEventListener(eventName,instance.activity,{passive:true});'),'activity listeners must be installed on the live app instance');
  assert.ok(runtime.includes('for(const eventName of editorActivityEvents)window.removeEventListener(eventName,instance.activity);'),'activity listeners must be cleaned up');
  assert.ok(!runtime.includes('window.setTimeout(()=>void flushDocumentCheckpoint().catch(()=>undefined),30000)'),'full Vault encryption must not run periodically while the editor stays open');
  assert.ok(runtime.includes('void flushDocumentCheckpoint().then(()=>baseCloseEditor())'),'closing the editor must still flush the encrypted checkpoint');
  assert.ok(runtime.includes('if(checkpointPending||checkpointFlushPromise){instance.cloudSyncQueued=true;return Promise.resolve();}'),'cloud publication must remain deferred while a lightweight checkpoint is pending');
});

test('v519 is installed in the production build pipeline after the checkpoint owner',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  const build=String(pkg.scripts?.build??'');
  const checkpoint=build.indexOf('node scripts/v350-rendering-storage-hardening.mjs');
  const guard=build.indexOf('node scripts/v519-critical-editor-runtime.mjs');
  assert.ok(checkpoint>=0,'checkpoint owner must remain in the build');
  assert.ok(guard>checkpoint,'v519 must harden the emitted runtime after v350 installs the checkpoint owner');
});
