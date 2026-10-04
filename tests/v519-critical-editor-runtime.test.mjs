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

test('v519 makes A4 preview physically non-shrinkable on every screen preview',async()=>{
  const css=await readFile('src/styles/critical-editor-geometry-v519.css','utf8');
  assert.match(css,/\.preview-stage>\.invoice-pages,[\s\S]*?width:210mm!important;[\s\S]*?min-width:210mm!important;[\s\S]*?max-width:none!important;[\s\S]*?flex:0 0 210mm!important/);
  assert.match(css,/\.preview-stage \.invoice-page,[\s\S]*?width:210mm!important;[\s\S]*?min-width:210mm!important;[\s\S]*?max-width:210mm!important;[\s\S]*?height:297mm!important/);
  assert.match(css,/\.screen-editor \.preview-stage[\s\S]*?display:block!important;[\s\S]*?overflow:auto!important/);
});

test('v519 restores bounded desktop split while tablet and iPad commercial editors stay single-column',async()=>{
  const css=await readFile('src/styles/critical-editor-geometry-v519.css','utf8');
  assert.match(css,/@media screen and \(min-width:1181px\)[\s\S]*?\.editor-layout[\s\S]*?grid-template-columns:minmax\(520px,48%\) minmax\(0,52%\)!important/);
  assert.match(css,/@media screen and \(min-width:1181px\) and \(max-width:1366px\)[\s\S]*?html\[data-lourex-ios-webkit="true"\][\s\S]*?\.editor-layout[\s\S]*?display:block!important/);
  assert.match(css,/@media screen and \(min-width:1181px\) and \(max-width:1366px\)[\s\S]*?html\[data-lourex-ios-webkit="true"\][\s\S]*?:is\(\.preview-pane,\.editor-preview-pane\)[\s\S]*?display:none!important/);
  assert.match(css,/@media screen and \(min-width:901px\) and \(max-width:1180px\)[\s\S]*?\.editor-layout[\s\S]*?display:block!important/);
  assert.match(css,/@media screen and \(min-width:901px\) and \(max-width:1180px\)[\s\S]*?:is\(\.preview-pane,\.editor-preview-pane\)[\s\S]*?display:none!important/);
});

test('v519 is the final production closeout after every historical visual and AI owner',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  const build=String(pkg.scripts?.build??'');
  const checkpoint=build.indexOf('node scripts/v350-rendering-storage-hardening.mjs');
  const guard='node scripts/v519-critical-editor-runtime.mjs';
  assert.ok(checkpoint>=0,'checkpoint owner must remain in the build');
  assert.ok(build.indexOf(guard)>checkpoint,'v519 must harden the emitted runtime after v350 installs the checkpoint owner');
  assert.ok(build.trim().endsWith(guard),'v519 must run last so no later visual/AI owner can override critical editor geometry');
  const bundle=await readFile('dist/styles/app.bundle.css','utf8');
  assert.ok(bundle.includes('LOUREX v519 — critical commercial editor geometry owner.'),'final production CSS must contain v519 geometry owner');
  assert.ok(bundle.trim().endsWith('}'),'final bundle must remain syntactically closed after v519 injection');
});
