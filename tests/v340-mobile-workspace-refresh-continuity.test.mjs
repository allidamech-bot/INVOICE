import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v340 checkpoints every stable TailAdmin workspace including Purchasing',async()=>{
  const runtime=await read('public/editor-stability-v338.js');
  assert.match(runtime,/const WORKSPACE_LAST_KEY='lourex-last-stable-workspace-v340'/);
  assert.match(runtime,/const WORKSPACES=\['home','documents','customers','items','operations','receivables','reports'\]/);
  assert.match(runtime,/document\.querySelector\('\.ta-shell'\)/);
  assert.match(runtime,/\.ta-sidebar-nav \.ta-nav-item/);
  assert.match(runtime,/operations:4/);
});

test('v340 restores the previous workspace after PIN, shell re-init or Safari reload',async()=>{
  const runtime=await read('public/editor-stability-v338.js');
  assert.match(runtime,/workspaceRestoreArmed=Boolean\(workspaceRestoreTarget&&workspaceRestoreTarget!=='home'\)/);
  assert.match(runtime,/document\.querySelector\('\.auth-page'\)/);
  assert.match(runtime,/document\.querySelector\('\.loading-screen,\.app-recovery-screen'\)/);
  assert.match(runtime,/armWorkspaceRestore\(\)/);
  assert.match(runtime,/button\.click\(\)/);
  assert.match(runtime,/removeWorkspace\(WORKSPACE_RESUME_KEY\)/);
});

test('v340 counts real iOS text mutations as activity across More workspaces',async()=>{
  const runtime=await read('public/editor-stability-v338.js');
  assert.match(runtime,/target\.closest\('\.app-ui'\)/);
  for(const event of ['beforeinput','input','compositionupdate','compositionend','paste','change'])assert.match(runtime,new RegExp(`'${event}'`));
  assert.match(runtime,/window\.dispatchEvent\(new KeyboardEvent\('keydown'/);
});

test('v340 keeps Apple mobile free of app-level pull reload and preserves sign-out semantics',async()=>{
  const runtime=await read('public/editor-stability-v338.js');
  assert.match(runtime,/root\.removeAttribute\('data-lourex-enable-pull-refresh'\)/);
  assert.match(runtime,/root\.dataset\.lourexSigningOut==='true'/);
  assert.match(runtime,/clearWorkspaceContinuityForSignOut\(\)/);
  assert.match(runtime,/platform==='MacIntel'&&touchPoints>1/);
});

test('v486 checkpoints only active editor identity and restores the exact saved document after reload',async()=>{
  const runtime=await read('public/editor-stability-v338.js');
  assert.match(runtime,/const EDITOR_RESUME_KEY='lourex-active-editor-v486'/);
  assert.match(runtime,/return \{id,number,savedAt:Date\.now\(\)\}/);
  assert.match(runtime,/sessionStorage\.setItem\(EDITOR_RESUME_KEY,JSON\.stringify\(valid\)\)/);
  assert.doesNotMatch(runtime,/EDITOR_RESUME_KEY[\s\S]{0,300}(?:items|customerSnapshot|attachments|notes)/,'editor recovery marker must not duplicate document contents outside the encrypted Vault');
  assert.match(runtime,/\.ta-doc-resume/);
  assert.match(runtime,/\.ta-doc-row-identity strong bdi,\.ta-doc-row-identity strong/);
  assert.match(runtime,/\.ta-doc-detail-toolbar-actions button/);
  assert.match(runtime,/exactText\([^\n]+target\.number\)/);
});

test('v486 keeps recovery through reload or automatic PIN lock but clears it after normal Back/sign-out',async()=>{
  const runtime=await read('public/editor-stability-v338.js');
  assert.match(runtime,/window\.addEventListener\('beforeunload',\(\)=>\{pageExiting=true;checkpointEditor\(\);\}\)/);
  assert.match(runtime,/window\.addEventListener\('pagehide',\(\)=>\{[\s\S]*pageExiting=true;[\s\S]*checkpointEditor\(\)/);
  assert.match(runtime,/if\(!pageExiting&&current\)clearEditorResume\(\)/);
  assert.match(runtime,/document\.querySelector\('\.auth-page'\)[\s\S]*armEditorRestore\(\)/);
  assert.match(runtime,/clearWorkspaceContinuityForSignOut\(\)[\s\S]*clearEditorResume\(\)/);
  assert.match(runtime,/attributeFilter:\['class','data-lourex-document-editor'\]/);
});