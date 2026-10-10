import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current phone navigation exposes core workspaces through compact More and dedicated tabs',async()=>{
 const [app,shell,shellCss,reportCss]=await Promise.all([read('src/app/App.tsx'),read('src/components/AppShell.tsx'),read('src/styles/tailadmin-shell-v320.css'),read('src/styles/reports-v135.css')]);
 for(const screen of ['documents','customers','receivables','reports','items','operations'])assert.ok(app.includes("screen==='"+screen+"'"),screen);
 for(const token of ['ta-mobile-nav','ta-mobile-sheet','ta-mobile-more','ta-mobile-create','this.mobileSheetItem(\'items\'','this.mobileSheetItem(\'operations\'','this.mobileSheetItem(\'receivables\'','this.mobileSheetItem(\'reports\''])assert.ok(shell.includes(token),token);
 assert.ok(shellCss.includes('.ta-mobile-nav')&&shellCss.includes('.ta-mobile-sheet'));
 assert.ok(shellCss.includes('min-width:0'));
 assert.equal(reportCss.includes('.app-ui .main-nav'),false);
});

test('v147 compacts customer and operations phone workspaces without changing printable documents',async()=>{
  const css=await read('src/styles/mobile-ui-rebalance-v146.css');
  for(const selector of ['.app-ui .customers-page .page-heading','.app-ui .customer-card','.app-ui .operations-hero','.app-ui .operations-summary > div','.app-ui .operations-tabs button','.app-ui .operation-row'])assert.ok(css.includes(selector),selector);
  assert.ok(css.includes('v147 phase 2'));
  assert.ok(css.includes('@media print'));
  assert.ok(!css.includes('.document-page{'));
  assert.ok(!css.includes('.document-header{'));
});

test('v148-v150 cover product library settings editor auth and modal phone surfaces while remaining app-only',async()=>{
  const [workspaces,editor,auth]=await Promise.all([
    read('src/styles/mobile-workspaces-v148.css'),
    read('src/styles/mobile-editor-recovery-v149.css'),
    read('src/styles/mobile-auth-modal-v150.css')
  ]);
  for(const selector of ['.app-ui .product-library-commandbar','.app-ui .product-library-editor-actions','.app-ui .settings-tabs','.app-ui .settings-title'])assert.ok(workspaces.includes(selector),selector);
  for(const selector of ['.app-ui .editor-topbar','.app-ui .document-readiness','.app-ui .editor-section','.app-ui .mobile-editor-actionbar','.app-ui .mobile-action-buttons'])assert.ok(editor.includes(selector),selector);
  for(const selector of ['.auth-page','.auth-card','.setup-actions','.app-ui .modal-header','.app-ui .cloud-account-panel','.app-ui .toast'])assert.ok(auth.includes(selector),selector);
  for(const css of [workspaces,editor,auth]){
    assert.ok(css.includes('@media print'));
    assert.ok(!css.includes('.document-page{'));
    assert.ok(!css.includes('.document-header{'));
    assert.ok(!css.includes('.items-table{'));
  }
});

test('current responsive TailAdmin recovery assets ship in one canonical offline bundle',async()=>{
 const [html,sw,bundle]=await Promise.all([read('index.html'),read('dist/sw.js'),read('dist/styles/app.bundle.css')]);
 for(const asset of ['tailadmin-shell-v320.css','tailadmin-editor-core-v320.css','tailadmin-auth-v320.css','tailadmin-overlays-v320.css','tailadmin-reliability-bridge-v320.css']){
   assert.ok(html.includes(asset),'source includes '+asset);
   assert.ok(bundle.includes(asset),'release includes '+asset);
 }
 assert.ok(sw.includes('styles/app.bundle.css'));
 assert.ok(!html.includes('mobile-ui-rebalance-v146.css'),'retired cascade cannot reclaim geometry');
});

