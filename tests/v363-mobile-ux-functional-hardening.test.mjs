import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v363 hardening layers are loaded after the visual system through the reliability bridge', async () => {
  const bridge = await read('src/styles/tailadmin-reliability-bridge-v320.css');
  assert.match(bridge, /^@import url\("\.\/mobile-ux-functional-hardening-v363\.css\?v=363-1"\);\n@import url\("\.\/modal-viewport-reconciliation-v363\.css\?v=363-1"\);/);
});

test('v363 reconciles Safari visualViewport inline geometry with floating modal cards', async () => {
  const css = await read('src/styles/modal-viewport-reconciliation-v363.css');
  assert.match(css, /\.modal-backdrop>\.modal:not\(:has\(\.ta-settings-shell\)\)/);
  assert.match(css, /width:calc\(100% - 16px\)!important/);
  assert.match(css, /\.modal-backdrop:has\(\.modal-sm \.modal-message\)>\.modal-sm/);
  assert.match(css, /align-self:center!important/);
  assert.match(css, /margin-bottom:max\(8px,env\(safe-area-inset-bottom,0px\)\)!important/);
});

test('v363 turns product and operations editors into reachable mobile sheets with visible validation', async () => {
  const css = await read('src/styles/mobile-ux-functional-hardening-v363.css');
  assert.match(css, /\.ta-product-layout:has\(>\.ta-product-editor\.is-open\)::before/);
  assert.match(css, /\.ta-product-editor\.is-open\{/);
  assert.match(css, /\.ta-ops-split:has\(>\.ta-ops-editor\)::before/);
  assert.match(css, /\.ta-ops-split>\.ta-ops-editor\{/);
  assert.match(css, /\.ta-operations-page:has\(\.ta-ops-editor\)>\.ta-ops-error/);
  assert.match(css, /\.ta-product-editor-scroll>\.ta-product-error/);
  assert.match(css, /\.modal-body:has\(>\.ta-customer-form\)>\.ta-customer-form-error/);
});

test('v363 bounds more/create menus and compact confirmations to the phone viewport', async () => {
  const css = await read('src/styles/mobile-ux-functional-hardening-v363.css');
  assert.match(css, /\.ta-mobile-sheet#ta-mobile-more/);
  assert.match(css, /height:min\(620px,calc\(100svh/);
  assert.match(css, /\.ta-create-menu-mobile\{/);
  assert.match(css, /max-height:calc\(100svh - 126px/);
  assert.match(css, /\.modal-backdrop:has\(\.modal-sm \.modal-message\)/);
  assert.match(css, /width:min\(390px,100%\)/);
});

test('financial and lifecycle destructive actions use LOUREX dialogs instead of browser confirms', async () => {
  const payments = await read('src/components/InvoicePaymentsPanel.tsx');
  const lifecycle = await read('src/components/DocumentLifecyclePanel.tsx');
  const paymentBrowser = await read('tests/visual/run-functional-payments.cjs');
  assert.doesNotMatch(payments, /window\.confirm\(/);
  assert.match(payments, /<ConfirmDialog/);
  assert.doesNotMatch(lifecycle, /window\.confirm\(/);
  assert.match(lifecycle, /<ConfirmDialog/);
  assert.doesNotMatch(paymentBrowser, /window\.confirm\s*=/);
  assert.match(paymentBrowser, /modal-footer-actions/);
  assert.match(paymentBrowser, /rapid LOUREX confirmation clicks must create one destructive request/);
});

test('operations uses app dialogs for business actions and only keeps the synchronous unsaved-work guard', async () => {
  const operations = await read('src/components/OperationsPage.tsx');
  assert.doesNotMatch(operations, /window\.prompt\(/);
  assert.match(operations, /type ConfirmAction=/);
  assert.match(operations, /renderActionDialogs/);
  assert.match(operations, /<ConfirmDialog/);
  assert.match(operations, /<Modal open=\{Boolean\(this\.state\.reverseTarget\)\}/);
  const confirms = operations.match(/window\.confirm\(/g) ?? [];
  assert.equal(confirms.length, 1, 'only the synchronous unsaved-work departure guard may use window.confirm');
});

test('dirty workspace guard recognizes the current TailAdmin customer and operations roots', async () => {
  const guard = await read('src/lib/workspace-dirty.ts');
  assert.match(guard, /customers:'\.ta-customers-page,\.ta-customer-profile,/);
  assert.match(guard, /operations:'\.ta-operations-page,\.operations-page'/);
  assert.match(guard, /document\.querySelector\(selector\)/);
});

test('runtime refresh, sign-out and account transitions recognize current editors before dirty publication', async () => {
  const runtime = await read('public/runtime-safety-v334.js');
  assert.match(runtime, /ACTIVE_DATA_ENTRY_SELECTOR='\.ta-product-editor\.is-open,\.ta-operations-page \.ta-ops-editor,\.product-library-pro\.editor-open,\.operations-page \.purchase-editor'/);
  assert.match(runtime, /document\.querySelector\('\.ta-operations-page \.ta-inventory-entry,\.operations-page \.ta-inventory-entry,\.operations-page \.inventory-entry'\)/);
  assert.match(runtime, /if\(activeDataEntryEditorOpen\(\)\)return true/);
  assert.match(runtime, /deferredByRuntimeSafety:true/);
  assert.match(runtime, /window\.setTimeout\(retryDeferredAccountTransition,400\)/);
  assert.match(runtime, /if\(ROOT\.hasAttribute\('data-lourex-workspace-dirty'\)\)return true/);
  assert.match(runtime, /return manualInventoryDraftOpen\(\)/);
});

test('cloud freshness and startup recovery keep current and legacy editor selectors protected', async () => {
  const freshness = await read('src/cloud/freshness.ts');
  const watchdog = await read('public/startup-watchdog-v321.js');
  for(const selector of ['.ta-product-editor.is-open','.ta-operations-page .ta-ops-editor','.product-library-pro.editor-open','.operations-page .purchase-editor']){
    assert.ok(freshness.includes(selector),`freshness missing ${selector}`);
    assert.ok(watchdog.includes(selector),`watchdog missing ${selector}`);
  }
  assert.match(freshness, /document\.querySelector\(UNSAFE_SURFACE_SELECTOR\)/);
  assert.match(watchdog, /automaticReload=no/);
});

test('manual lock and automatic reload continuity use current TailAdmin roots and navigation', async () => {
  const app = await read('src/app/index.tsx');
  assert.match(app, /document\.querySelector\('\.ta-operations-page \.ta-inventory-entry,\.operations-page \.ta-inventory-entry,\.operations-page \.inventory-entry'\)/);
  assert.match(app, /RESTORABLE_WORKSPACES:RestorableWorkspace\[\]=\['home','documents','customers','items','operations','receivables','reports'\]/);
  for(const selector of ['.ta-finance-dashboard','.ta-documents-page','.ta-customers-page','.ta-products-workspace','.ta-operations-page','.ta-receivables-page','.ta-reports-page'])assert.ok(app.includes(selector),selector);
  assert.match(app, /\.ta-sidebar-nav \.ta-nav-item/);
  assert.match(app, /\.ta-auth-page,\.auth-page/);
});

test('pull-to-refresh cannot start inside current operations or dirty product workspaces', async () => {
  const pull = await read('public/pull-to-refresh.js');
  assert.match(pull, /blockedTarget=.*\.ta-operations-page/);
  assert.match(pull, /blockedTarget=.*\.ta-products-workspace/);
  assert.match(pull, /blockedTarget=.*\.ta-product-editor\.is-open/);
  assert.match(pull, /hasAttribute\('data-lourex-workspace-dirty'\)\)return false/);
  assert.match(pull, /document\.querySelector\('[^']*\.ta-operations-page[^']*\.ta-products-workspace[^']*\.ta-product-editor\.is-open[^']*'\)\)return false/);
  assert.match(pull, /\.product-library-pro\.editor-open/);
});

test('reports keep phone filters and labeled-record tables within the final mobile contract', async () => {
  const css = await read('src/styles/mobile-ux-functional-hardening-v363.css');
  const reports = await read('src/components/ReportsPage.tsx');
  assert.match(css, /\.ta-report-filterbar\{/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.ta-report-presets/);
  assert.match(reports, /data-label=\{t\('Month','الشهر'\)\}/);
  assert.match(reports, /aria-pressed=\{this\.state\.preset==='month'\}/);
});
