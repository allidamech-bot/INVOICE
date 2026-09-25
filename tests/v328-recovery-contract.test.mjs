import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('account switching never hard reloads the running workspace',async()=>{
  const [index,app]=await Promise.all([read('src/app/index.tsx'),read('src/app/App.tsx')]);
  const watcher=index.slice(index.indexOf('function startAccountSignOutWatcher'),index.indexOf('async function start()'));
  assert.match(watcher,/lourex-account-transition-request/);
  assert.doesNotMatch(watcher,/location\.(?:reload|replace)/);
  assert.match(app,/handleAccountTransitionRequest/);
  assert.match(app,/await this\.drainVaultWrites\(\)/);
  assert.match(app,/await this\.waitForCloudIdle\(\)/);
});

test('create center invokes document actions directly without pointer-frame races',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  const actions=shell.slice(shell.indexOf('private createDocument='),shell.indexOf('private hasSignedInAccount='));
  assert.doesNotMatch(actions,/requestAnimationFrame/);
  assert.doesNotMatch(actions,/closeCreateMenu/);
  assert.match(actions,/this\.props\.onNew\(kind\)/);
  assert.match(actions,/this\.props\.onCreditNote\(\)/);
  assert.match(actions,/this\.props\.onStatementAccount\(\)/);
});

test('mobile document step navigation belongs to the editor scroll surface',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  const scrollIndex=core.indexOf('className="editor-scroll"');
  const navIndex=core.indexOf('data-editor-nav-slot');
  const fieldsetIndex=core.indexOf('className="editor-form-lock"');
  assert.ok(scrollIndex>=0&&navIndex>scrollIndex&&navIndex<fieldsetIndex,'step navigation must be inside editor-scroll before the form');
  assert.equal((core.match(/data-editor-nav-slot/g)||[]).length,1);
});

test('v328 mobile presentation owns aligned AI, compact advisor and readable templates',async()=>{
  const [aiCss,templateCss]=await Promise.all([read('src/styles/tailadmin-ai-finish-v320.css'),read('src/styles/template-preferences.css')]);
  assert.match(aiCss,/v328 — unified AI identity/);
  assert.match(aiCss,/\.lourex-ai-launcher[^}]*width:44px!important[^}]*height:44px!important/);
  assert.match(aiCss,/\.lourex-advisor-card/);
  assert.match(templateCss,/v328 — phone template gallery/);
  assert.match(templateCss,/grid-template-columns:minmax\(0,1fr\)!important/);
});
