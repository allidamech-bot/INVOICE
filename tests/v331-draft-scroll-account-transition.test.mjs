import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v336 restores ta-main as the Safari-safe mobile document scroll owner',async()=>{
  const css=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(css,/\.ta-shell\.is-editor>\.ta-main,[\s\S]*\.ta-shell\.screen-editor>\.ta-main,[\s\S]*\.screen-editor \.ta-main\{[\s\S]*overflow-y:auto!important[\s\S]*touch-action:pan-y!important/);
  assert.match(css,/\.ta-shell\.is-editor:has\(\.draft-studio\)>\.ta-main,[\s\S]*\.ta-shell\.screen-editor:has\(\.draft-studio\)>\.ta-main\{[\s\S]*overflow-y:auto!important/);
  assert.match(css,/\.ta-draft-studio-workspace \.draft-studio-scroll\{[\s\S]*height:auto!important[\s\S]*overflow:visible!important/);
  assert.doesNotMatch(css,/\.ta-draft-studio-workspace \.draft-studio-scroll\{[\s\S]{0,260}overflow-y:auto!important/);
});

test('v331 defers automatic account/storage transitions while any editor is open',async()=>{
  const runtime=await read('public/document-entry-v302.js');
  assert.match(runtime,/function editorOrUnsafeWorkspaceOpen\(\)/);
  assert.match(runtime,/data-lourex-document-editor/);
  assert.match(runtime,/\.editor-screen/);
  assert.match(runtime,/function guardAutomaticAccountTransition\(event\)/);
  assert.match(runtime,/event\.stopImmediatePropagation\(\)/);
  assert.match(runtime,/deferredByEditorGuard:true/);
  assert.match(runtime,/window\.addEventListener\('lourex-account-transition-request',guardAutomaticAccountTransition,true\)/);
});

test('v331 runtime promotes the recovery stylesheet after TailAdmin owners',async()=>{
  const runtime=await read('public/document-entry-v302.js');
  const promote=runtime.indexOf('promoteTailAdminOwners();');
  const draft=runtime.indexOf('promoteDraftRecovery();');
  assert.ok(promote>=0&&draft>promote);
  assert.match(runtime,/v331-draft-scroll-recovery\.css\?v=331-1/);
});

test('v336 scroll recovery does not change Draft save PDF share behavior',async()=>{
  const editor=await read('src/components/DraftDocumentEditor.tsx');
  assert.match(editor,/onClick=\{\(\)=>void this\.output\('pdf'\)\}>PDF/);
  assert.match(editor,/onClick=\{\(\)=>void this\.output\('share'\)\}/);
  assert.match(editor,/onClick=\{\(\)=>void this\.save\(false\)\}/);
});
