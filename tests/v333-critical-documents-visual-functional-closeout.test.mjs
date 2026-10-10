import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('editor suppresses the redundant readiness meter and preserves readable light/dark design tokens',async()=>{
 const css=await read('src/styles/v330-template-contrast-guard.css');
 assert.ok(css.includes('.document-readiness{display:none!important;}'));
 for(const token of ['--v333-workspace:#eef3f8','--v333-card:#ffffff','--v333-field:#fbfcfe','--v333-workspace:#07111f','--v333-card:#101c2c','--v333-field:#0b1726'])assert.ok(css.includes(token),token);
});

test('commercial document fields keep readable ink through Safari focus and autofill', async () => {
  const css = await read('src/styles/v330-template-contrast-guard.css');
  assert.match(css, /-webkit-text-fill-color:var\(--v333-text/);
  assert.match(css, /:-webkit-autofill/);
  assert.match(css, /-webkit-box-shadow:0 0 0 1000px var\(--v333-field-focus/);
  assert.match(css, /color-scheme:dark!important/);
  assert.match(css, /color-scheme:light!important/);
  assert.match(css, /::placeholder/);
});

test('Draft Safari native field paint remains readable within a single bounded scrolling editor',async()=>{
 const [css,recovery]=await Promise.all([read('src/styles/v333-critical-documents-visual-functional-closeout.css'),read('src/styles/v331-draft-scroll-recovery.css')]);
 for(const token of ['v333-critical-documents-visual-functional-closeout.css?v=333-1'])assert.ok(recovery.includes(token),token);
 for(const token of ['input:not([type="range"]):not([type="color"])','::-webkit-date-and-time-value','-webkit-text-fill-color:var(--ft-text-strong)','color-scheme:dark!important','color-scheme:light!important'])assert.ok(css.includes(token),token);
 assert.ok(recovery.includes('.ta-shell.is-editor:has(.draft-studio)>.ta-main'));
 assert.ok(recovery.includes('overflow-y:auto!important'));
 assert.ok(recovery.includes('.ta-draft-studio-workspace .draft-studio-scroll'));
 assert.ok(recovery.includes('overflow:visible!important'));
});

test('mobile commercial editor is full-width and avoids a nested bordered scroll pane', async () => {
  const css = await read('src/styles/v330-template-contrast-guard.css');
  assert.match(css, /@media screen and \(max-width:900px\)[\s\S]*\.screen-editor \.editor-layout\{[\s\S]*width:100%!important/);
  assert.match(css, /\.screen-editor \.editor-pane\{[\s\S]*border:0!important[\s\S]*overflow:visible!important/);
  assert.match(css, /\.screen-editor \.editor-scroll\{[\s\S]*overflow:visible!important/);
  assert.match(css, /\.screen-editor \.lourex-ai-launcher\{[\s\S]*right:max\(14px,env\(safe-area-inset-right,0px\)\)!important[\s\S]*bottom:calc\(90px/);
});

test('attachment empty state is a compact modern upload surface on mobile', async () => {
  const css = await read('src/styles/v330-template-contrast-guard.css');
  assert.match(css, /\.attachments-empty\{[\s\S]*min-height:150px!important[\s\S]*border:1px dashed/);
  assert.match(css, /\.attachment-add-button\{[\s\S]*background:var\(--v333-accent\)!important[\s\S]*color:#fff!important/);
  assert.match(css, /\.document-attachments-section>\.attachment-help\{[\s\S]*display:none!important/);
});

test('Create Center exposes ten visually distinct business-document identities', async () => {
  const css = await read('src/styles/v330-template-contrast-guard.css');
  for (const code of ['DR','RFQ','QT','PI','PO','INV','DN','RC','CN','SOA']) {
    assert.match(css, new RegExp(`--v333-code:\"${code}\"`));
  }
  assert.match(css, /\.ta-create-menu-grid>button>\.icon\{display:none!important;\}/);
  assert.match(css, /\.ta-create-menu-grid>button::after\{[\s\S]*content:var\(--v333-code/);

  const runtime = await read('public/document-entry-v302.js');
  for (const kind of ['draft','rfq','proforma','proforma-invoice','purchase-order','invoice','delivery-note','payment-receipt','credit-note','statement-account']) {
    assert.match(runtime, new RegExp(`['\"]${kind}['\"]`));
  }
  assert.match(runtime, /normalizeCreateMenuKinds\(\)/);
});

test('printable templates use v141 as the sole commercial close owner', async () => {
  const editorLayer = await read('src/styles/v330-template-contrast-guard.css');
  const base = await read('src/styles/document-premium-redesign-v141.css');
  const balance = await read('src/styles/v337-template-layout-balance.css');
  assert.match(base, /\.header-executive\{[^}]*background:#09273c[^}]*color:#fff/);
  assert.match(base, /\.doc-body\{[^}]*display:flex[^}]*flex-direction:column/);
  assert.match(base, /\.final-details\{[^}]*flex:0 0 auto[^}]*margin-top:auto[^}]*padding-top:6mm/);
  assert.match(base, /\.bottom-grid\{[^}]*margin-top:4\.5mm[^}]*align-items:start/);
  assert.match(base, /\.signature-media \.stamp-image\{height:22mm\}/);
  assert.doesNotMatch(editorLayer, /\.invoice-page(?:\.template| \.final-details| \.bottom-grid| \.signature-media)/);
  assert.doesNotMatch(balance, /\.invoice-page(?:\:not\([^)]*\))? \.final-details\s*\{|\.invoice-page \.bottom-grid\s*\{|\.invoice-page \.signature-media\s*\{/);
});

test('automatic account/cloud/PWA transitions remain editor-safe', async () => {
  const index = await read('src/app/index.tsx');
  const runtime = await read('public/document-entry-v302.js');
  assert.match(index, /function reloadUnsafeWorkspaceOpen\(\):boolean\{[\s\S]*isDocumentEditorOpen\(\)/);
  assert.match(index, /reload\.addEventListener\('click',[\s\S]*if\(reloadUnsafeWorkspaceOpen\(\)\)[\s\S]*window\.location\.reload\(\)/);
  assert.match(index, /if\(reloadUnsafeWorkspaceOpen\(\)\)\{updateNoticeDeferredForWorkspace\(\);return;\}/);
  assert.match(runtime, /function guardAutomaticAccountTransition\(event\)[\s\S]*editorOrUnsafeWorkspaceOpen\(\)[\s\S]*stopImmediatePropagation/);
  assert.match(runtime, /function recoverLateAuthenticatedAccount\(\)[\s\S]*if\(editorOrUnsafeWorkspaceOpen\(\)\)return/);
});

test('v333/v337 visual layers do not own business persistence or accounting', async () => {
  const commercial = await read('src/styles/v330-template-contrast-guard.css');
  const draft = await read('src/styles/v333-critical-documents-visual-functional-closeout.css');
  const balance = await read('src/styles/v337-template-layout-balance.css');
  const combined = `${commercial}\n${draft}\n${balance}`;
  assert.doesNotMatch(combined, /firebase|indexedDB|localStorage|saveVault|calculateTotals|invoicePaymentSummary|persist\(/i);
});
