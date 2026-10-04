import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('active quotation autosave stays lightweight in its existing v350 owner',async()=>{
  const source=await readFile('scripts/v350-rendering-storage-hardening.mjs','utf8');
  assert.ok(source.includes('saveDocumentAutosaveCheckpoint(key,checkpointDocument,checkpointEvents'),'autosave must keep the encrypted per-document checkpoint');
  assert.ok(!source.includes('checkpointFlushTimer'),'active editing must not own a periodic full-vault timer');
  assert.ok(!source.includes('scheduleDocumentCheckpointFlush'),'active editing must not schedule periodic full-vault encryption');
  assert.ok(!source.includes('30000'),'the removed 30-second full-vault cycle must not survive in the checkpoint owner');
  assert.ok(source.includes('void flushDocumentCheckpoint().then(()=>baseCloseEditor())'),'normal editor close must flush the checkpoint into the authoritative Vault');
  assert.ok(source.includes('if(checkpointPending||checkpointFlushPromise){instance.cloudSyncQueued=true;return Promise.resolve();}'),'cloud publication must remain deferred while a checkpoint is pending');
  assert.ok(source.includes('recoverDocumentAutosaveCheckpoint(key,vault)'),'crash/process recovery must keep the encrypted checkpoint recovery path');
});

test('mobile keyboard activity keeps the established stability owner',async()=>{
  const [stability,checkpointOwner]=await Promise.all([
    readFile('public/editor-stability-v338.js','utf8'),
    readFile('scripts/v350-rendering-storage-hardening.mjs','utf8')
  ]);
  assert.match(stability,/\['beforeinput','input','compositionupdate','compositionend','paste','change'\]/,'the existing stability runtime must observe real text mutations');
  assert.ok(stability.includes("window.dispatchEvent(new KeyboardEvent('keydown'"),'text mutation must feed the existing inactivity activity channel');
  assert.ok(!checkpointOwner.includes('editorActivityEvents'),'autosave persistence must not install a duplicate activity-listener layer');
});

test('physical A4 geometry is owned by document.css and cannot shrink inside preview chrome',async()=>{
  const css=await readFile('src/styles/document.css','utf8');
  assert.match(css,/\.invoice-page\{width:210mm;min-width:210mm;max-width:210mm;height:297mm;min-height:297mm;flex:0 0 297mm/);
  assert.match(css,/\.preview-stage \.invoice-pages,\.mobile-preview-stage \.invoice-pages\{width:210mm;min-width:210mm;max-width:none;flex:0 0 auto/);
  assert.match(css,/@media print\{\.invoice-page\{width:210mm;min-width:210mm;max-width:210mm;height:297mm;min-height:297mm/);
});

test('existing iPad runtime marker and reliability CSS remove the dead commercial preview track',async()=>{
  const [runtimeOwner,reliabilityCss]=await Promise.all([
    readFile('scripts/v339-ipados-desktop-stability.mjs','utf8'),
    readFile('src/styles/tailadmin-reliability-bridge-v320.css','utf8')
  ]);
  assert.ok(runtimeOwner.includes("document.documentElement.setAttribute('data-lourex-ios-webkit','true')"),'existing iPad runtime must expose the WebKit capability marker');
  assert.match(reliabilityCss,/@media screen and \(min-width:1181px\) and \(max-width:1366px\)[\s\S]*?html\[data-lourex-ios-webkit="true"\][\s\S]*?\.editor-layout\{[\s\S]*?display:block!important/,'source reliability owner must collapse the iPad editor to one column');
  assert.match(reliabilityCss,/html\[data-lourex-ios-webkit="true"\][\s\S]*?:is\(\.editor-preview-pane,\.preview-pane\)\{[\s\S]*?display:none!important/,'source reliability owner must remove the dead iPad preview track');
  assert.ok(!runtimeOwner.includes('ipadCommercialGeometry'),'generated runtime hardening must not append a second quotation geometry layer');
});

test('commercial editor keeps existing TailAdmin desktop owner and no v519 postbuild layer',async()=>{
  const [pkg,editorCss]=await Promise.all([
    readFile('package.json','utf8').then(JSON.parse),
    readFile('src/styles/tailadmin-editor-core-v320.css','utf8')
  ]);
  const build=String(pkg.scripts?.build??'');
  assert.ok(build.includes('node scripts/v339-ipados-desktop-stability.mjs'),'existing iPad stability owner must remain in the build');
  assert.ok(build.includes('node scripts/v350-rendering-storage-hardening.mjs'),'v350 persistence owner must remain in the build');
  assert.ok(!build.includes('v519-critical-editor-runtime'),'a second postbuild editor owner must not return');
  assert.match(editorCss,/\.app-ui \.editor-layout\{display:grid!important;grid-template-columns:minmax\(460px,\.92fr\) minmax\(520px,1\.08fr\)!important/,'desktop editor/preview split stays in TailAdmin editor core');
  assert.match(editorCss,/@media\(max-width:1180px\)[\s\S]*?\.editor-preview-pane,\.app-ui \.preview-pane,\.app-ui \.draft-studio-preview\{display:none!important\}/,'tablet editor keeps the established single-column preview-on-demand contract');
});
