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
