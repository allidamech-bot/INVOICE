import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [css,bundler]=await Promise.all([
  read('src/styles/executive-coherence-v480.css'),
  read('scripts/v480-bundle-executive-design.mjs')
]);

test('v480 coherence closeout is bundled after the four structural design owners',()=>{
  assert.match(css,/LOUREX Executive Coherence v480/);
  assert.match(css,/@media screen and \(max-width:900px\)/);
  assert.ok(bundler.indexOf("['executive-overlays-auth-v480.css','480-4']")<bundler.indexOf("['executive-coherence-v480.css','480-5']"));
  assert.match(bundler,/executive-coherence-v480\.css/);
});

test('v480 coherence is screenshot-driven and covers the remaining visual seams',()=>{
  for(const selector of ['.workspace-shell.screen-home .ta-main','.lx-notification-summary','.ta-doc-commandbar','.ta-doc-type-tabs','.ta-settings-shell','.ta-settings-nav','.ta-settings-content','#lourex-ai-panel .lourex-ai-plus-menu','#lourex-ai-panel .lourex-ai-plus-item','.workspace-shell.screen-editor'])assert.ok(css.includes(selector),`coherence owner missing ${selector}`);
  assert.match(css,/grid-template-columns:38px minmax\(0,1fr\)/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/min-height:44px/);
});

test('v480 coherence cannot mutate business or account state',()=>{
  for(const token of ['localStorage','indexedDB','firebase','firestore','calculateTotals(','setState(','onNew(','onDelete(','onSave(','vault.','fetch('])assert.ok(!css.includes(token),`coherence CSS contains forbidden token ${token}`);
});
