import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v363 hardening layers are loaded after the visual system through the reliability bridge', async () => {
  const bridge = await read('src/styles/tailadmin-reliability-bridge-v320.css');
  assert.match(bridge, /^@import url\("\.\/mobile-ux-functional-hardening-v363\.css\?v=363-1"\);\n@import url\("\.\/modal-viewport-reconciliation-v363\.css\?v=363-1"\);\n@import url\("\.\/mobile-ux-deep-audit-v363\.css\?v=363-1"\);/);
});

test('production build inlines every v363 owner before the final reliability bridge instead of shipping late imports', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const helper = await read('scripts/v363-bundle-visual-owners.mjs');
  assert.match(pkg.scripts.build, /node scripts\/build\.mjs && node scripts\/v363-bundle-visual-owners\.mjs/);
  for(const name of ['mobile-ux-functional-hardening-v363.css','modal-viewport-reconciliation-v363.css','mobile-ux-deep-audit-v363.css','mobile-core-workflows-v364.css']){
    assert.ok(helper.includes(name),`bundle helper missing ${name}`);
  }
  assert.match(helper, /tailadmin-reliability-bridge-v320\.css/);
  assert.match(helper, /bundle=bundle\.replace/);
  assert.match(helper, /ownerBlocks\.join/);
  assert.match(helper, /ownerIndex<0\|\|ownerIndex>finalBridgeIndex/);
  assert.match(helper, /late @import remains/);
});

test('v364 mobile document suggestions and purchase editor sections remain reachable and legible', async () => {
  const bridge = await read('src/styles/tailadmin-reliability-bridge-v320.css');
  const helper = await read('scripts/v363-bundle-visual-owners.mjs');
  const css = await read('src/styles/mobile-core-workflows-v364.css');
  assert.match(bridge, /@import url\("\.\/mobile-core-workflows-v364\.css\?v=364-1"\);/);
  assert.match(helper, /\['mobile-core-workflows-v364\.css','@import url\("\.\/mobile-core-workflows-v364\.css\?v=364-1"\);'\]/);
  assert.match(css, /customer-select-wrap>\.customer-dropdown\{[\s\S]*position:static!important/);
  assert.match(css, /ta-ops-form-section>header\{[\s\S]*display:grid!important/);
  assert.match(css, /ta-ops-editor-scroll>fieldset\{[\s\S]*border:0!important/);
  assert.match(css, /ta-purchase-totals\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css, /ta-ops-editor-actions\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css, /issue-review-status>div,[\s\S]*display:flex!important/);
  assert.match(css, /issue-review-grid\{[\s\S]*display:grid!important/);
  assert.match(css, /issue-warning>p\{[\s\S]*overflow-wrap:anywhere!important/);
  assert.match(css, /max-width:560px\)[\s\S]*issue-review-grid\{grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css, /ta-ops-panel-head>\.btn-primary:hover:not\(:disabled\),[\s\S]*ta-ops-split :is\(\.btn\.btn-primary,button\.btn-primary\):hover:not\(:disabled\),[\s\S]*ta-ops-panel-head>\.btn-primary:active:not\(:disabled\),[\s\S]*ta-ops-split :is\(\.btn\.btn-primary,button\.btn-primary\):active:not\(:disabled\)\{[\s\S]*background:var\(--ft-accent\)!important/);
});

test('PDF color normalization covers modern logical borders and inherited scrollbar colors', async () => {
  const bridge = await read('public/ios-print-bridge.js');
  assert.match(bridge, /'border-block-start-color','border-block-end-color','border-inline-start-color','border-inline-end-color','scrollbar-color'/);
  assert.match(bridge, /normalizeUnsupportedColors\(stage\)/);
  assert.ok(bridge.indexOf('normalizeUnsupportedColors(stage)')<bridge.indexOf('window.html2canvas(page'));
});

test('Draft has a separate PDF design gallery that applies real letterhead settings', async () => {
  const editor = await read('src/components/DraftDocumentEditor.tsx');
  const types = await read('src/types.ts');
  assert.match(editor, /draft-pdf-template-grid/);
  assert.match(editor, /aria-pressed=\{this\.activePdfDesign\(letter\)===design\.id\}/);
  assert.match(editor, /onClick=\{\(\)=>this\.applyPdfDesign\(design\.id\)\}/);
  assert.match(editor, /footerStyle:'company',bodyWidth:'comfortable'/);
  assert.match(editor, /footerStyle:'minimal',bodyWidth:'wide'/);
  assert.match(editor, /footerStyle:'none',bodyWidth:'narrow'/);
  assert.match(types, /export interface LetterDocumentData/);
});

test('v363 deep audit keeps primary actions on the current accent, prevents Safari AI zoom and bounds retained import flows', async () => {
  const css = await read('src/styles/mobile-ux-deep-audit-v363.css');
  assert.match(css, /\.btn\.btn-primary,button\.btn-primary/);
  assert.match(css, /background:var\(--ft-accent,#315da8\)!important/);
  assert.match(css, /background-image:none!important/);
  assert.match(css, /\.lourex-ai-compose input\{[\s\S]*font-size:16px!important/);
  assert.match(css, /\.modal-backdrop:has\(\.product-import-shell\)/);
  assert.match(css, /\.modal-backdrop:has\(\.supplier-import-shell\)/);
  assert.match(css, /max-height:min\(88svh,820px\)!important/);
  assert.match(css, /padding-bottom:max\(8px,env\(safe-area-inset-bottom,0px\)\)!important/);
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
  assert.match(runtime, /if\(currentUid!==uid\)/);
  assert.match(runtime, /deferredByRuntimeSafety:true/);
  assert.match(runtime, /window\.setTimeout\(retryDeferredAccountTransition,400\)/);
  assert.match(runtime, /if\(ROOT\.hasAttribute\('data-lourex-workspace-dirty'\)\)return true/);
  assert.match(runtime, /return manualInventoryDraftOpen\(\)/);
});

test('cloud freshness, startup recovery and document-entry fallback keep current and legacy editor selectors protected', async () => {
  const freshness = await read('src/cloud/freshness.ts');
  const watchdog = await read('public/startup-watchdog-v321.js');
  const documentEntry = await read('public/document-entry-v302.js');
  for(const selector of ['.ta-product-editor.is-open','.ta-operations-page .ta-ops-editor','.product-library-pro.editor-open','.operations-page .purchase-editor']){
    assert.ok(freshness.includes(selector),`freshness missing ${selector}`);
    assert.ok(watchdog.includes(selector),`watchdog missing ${selector}`);
    assert.ok(documentEntry.includes(selector),`document entry missing ${selector}`);
  }
  assert.match(freshness, /document\.querySelector\(UNSAFE_SURFACE_SELECTOR\)/);
  assert.match(watchdog, /automaticReload=no/);
  assert.match(documentEntry, /function editorOrUnsafeWorkspaceOpen\(\)/);
});

test('manual lock and automatic reload continuity use current TailAdmin roots and current editor selectors', async () => {
  const app = await read('src/app/index.tsx');
  assert.match(app, /document\.querySelector\('\.ta-operations-page \.ta-inventory-entry,\.operations-page \.ta-inventory-entry,\.operations-page \.inventory-entry'\)/);
  assert.ok(app.includes('.ta-product-editor.is-open,.ta-operations-page .ta-ops-editor,.product-library-pro.editor-open,.operations-page .purchase-editor'));
  assert.match(app, /manualLockUnsafeWorkspaceOpen\(\):boolean\{[\s\S]*activeDataEntryEditorOpen\(\)/);
  assert.match(app, /reloadUnsafeWorkspaceOpen\(\):boolean\{[\s\S]*activeDataEntryEditorOpen\(\)/);
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

test('current WebKit browser QA physically opens and measures the critical 320px business editors', async () => {
  const browser = await read('tests/visual/run-v326-business-workspaces.cjs');
  const operationsFixture = await read('tests/visual/functional-products-operations-v197.html');
  const productFixture = await read('tests/visual/v326-products-workspace.html');
  const importFixture = await read('tests/visual/import-final-audit-v267.html');
  assert.match(browser, /deepMobileAudit/);
  assert.match(browser, /engineName!==['"]webkit['"]\|\|scenario\.name!==['"]iphone320-light['"]/);
  assert.match(browser, /\.modal:has\(\.ta-customer-form\)/);
  assert.match(browser, /\.ta-product-editor\.is-open/);
  assert.match(browser, /Supplier editor/);
  assert.match(browser, /Purchase editor/);
  assert.match(browser, /Expense editor/);
  assert.match(browser, /\.ta-inventory-entry/);
  assert.match(browser, /assertPrimaryAccent/);
  assert.match(browser, /fontSize<15\.5/);
  assert.match(browser, /footer fell below viewport after scroll/);
  assert.match(operationsFixture, /window\.innerWidth<=320\)window\.confirm=\(\)=>\{window\.confirmAttempts\+=1;return true;\}/);
  assert.match(productFixture, /theme-bootstrap-v347\.js\?v=361[\s\S]*styles\/app\.bundle\.css/);
  assert.match(importFixture, /data-ui-theme="light" data-ui-theme-preference="light"/);
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
