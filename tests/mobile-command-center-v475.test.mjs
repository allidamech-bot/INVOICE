import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

// Compatibility filename retained for CI diff execution. v475 is intentionally
// retired; these assertions protect the replacement v480 single-owner mobile stack.
test('v475 command-center runtime ownership is retired and v480 is canonical',async()=>{
  const [bridge,home,workspaces,editor,overlays]=await Promise.all([
    read('src/styles/tailadmin-reliability-bridge-v320.css'),
    read('src/styles/executive-command-center-v480.css'),
    read('src/styles/executive-workspaces-v480.css'),
    read('src/styles/executive-editor-v480.css'),
    read('src/styles/executive-overlays-auth-v480.css')
  ]);
  assert.doesNotMatch(bridge,/mobile-(?:command-center|workspaces|editor|overlays|auth|review)-v475/);
  const order=['executive-command-center-v480.css?v=480-1','executive-workspaces-v480.css?v=480-2','executive-editor-v480.css?v=480-3','executive-overlays-auth-v480.css?v=480-4'].map(name=>bridge.indexOf(name));
  assert.ok(order.every(index=>index>=0)&&order.every((index,i)=>i===0||index>order[i-1]),'v480 presentation owners must load in deterministic order');
  for(const css of [home,workspaces,editor,overlays])assert.match(css,/@media screen and \(max-width:900px\)/);
});

test('v480 replacement reaches the whole mobile product instead of recoloring Home only',async()=>{
  const [home,workspaces,editor,overlays]=await Promise.all([
    read('src/styles/executive-command-center-v480.css'),
    read('src/styles/executive-workspaces-v480.css'),
    read('src/styles/executive-editor-v480.css'),
    read('src/styles/executive-overlays-auth-v480.css')
  ]);
  for(const selector of ['.ta-dashboard-header','.ta-kpi-grid','.ta-mobile-nav'])assert.ok(home.includes(selector),`missing home/shell selector ${selector}`);
  for(const selector of ['.ta-documents-page','.ta-doc-detail-page','.ta-customers-page','.ta-customer-profile','.ta-products-workspace','.ta-operations-page','.ta-finance-page','.ta-reports-page','.ta-settings-shell'])assert.ok(workspaces.includes(selector),`missing workspace selector ${selector}`);
  for(const selector of ['.workspace-shell.screen-editor','.editor-topbar','.ta-editor-step-nav','.draft-studio-topbar','.mobile-editor-actionbar'])assert.ok(editor.includes(selector),`missing editor selector ${selector}`);
  for(const selector of ['.global-search-panel','.lourex-ai-panel','.lx-notification-summary','.ta-mobile-sheet','.ta-auth-page'])assert.ok(overlays.includes(selector),`missing overlay/auth selector ${selector}`);
});

test('v480 replacement remains presentation-only',async()=>{
  const css=(await Promise.all(['executive-command-center-v480.css','executive-workspaces-v480.css','executive-editor-v480.css','executive-overlays-auth-v480.css'].map(name=>read(`src/styles/${name}`)))).join('\n');
  for(const token of ['localStorage','indexedDB','firebase','firestore','calculateTotals(','setState(','onNew(','onDelete(','onSave(','vault.'])assert.ok(!css.includes(token),`presentation stack contains forbidden mutation token ${token}`);
});
