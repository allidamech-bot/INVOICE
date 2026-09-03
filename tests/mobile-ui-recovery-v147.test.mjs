import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v152 keeps all six phone workspaces in one accessible navigation row',async()=>{
  const [app,reportsCss,recoveryCss]=await Promise.all([read('src/app/App.tsx'),read('src/styles/reports-v135.css'),read('src/styles/ux-recovery-v152.css')]);
  for(const screen of ['documents','customers','receivables','reports','items','operations'])assert.ok(app.includes(`screen==='${screen}'`),screen);
  assert.ok(!reportsCss.includes('.app-ui .main-nav'),'report styles do not own shared navigation');
  assert.ok(recoveryCss.includes('.app-ui .main-nav button'));
  assert.ok(recoveryCss.includes('grid-template-columns:repeat(6,minmax(0,1fr))!important'));
  assert.ok(recoveryCss.includes('min-width:0!important'));
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

test('final mobile recovery styles load before the performance layer and ship in the offline shell',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const layers=['mobile-ui-rebalance-v146.css','mobile-workspaces-v148.css','mobile-editor-recovery-v149.css','mobile-auth-modal-v150.css'];
  for(const layer of layers){
    assert.ok(html.includes(`./styles/${layer}`),`${layer} loaded`);
    assert.ok(sw.includes(`./styles/${layer}`),`${layer} cached`);
    assert.ok(html.indexOf(layer)<html.indexOf('performance-polish-v100.css'),`${layer} remains below performance layer`);
  }
});
