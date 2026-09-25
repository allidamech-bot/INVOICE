import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v333 removes the low-value readiness meter and restores clear editor surface hierarchy', async () => {
  const css = await read('src/styles/v330-template-contrast-guard.css');
  assert.match(css, /v333 — critical document visual\/interaction closeout/);
  assert.match(css, /\.screen-editor \.document-readiness\{display:none!important;\}/);
  assert.match(css, /--v333-workspace:#eef3f8/);
  assert.match(css, /--v333-card:#ffffff/);
  assert.match(css, /--v333-field:#fbfcfe/);
  assert.match(css, /--v333-workspace:#07111f/);
  assert.match(css, /--v333-card:#101c2c/);
  assert.match(css, /--v333-field:#0b1726/);
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

test('Draft Studio receives the same Safari-safe field contract without taking scroll ownership from v331', async () => {
  const css = await read('src/styles/v333-critical-documents-visual-functional-closeout.css');
  const recovery = await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(recovery, /^@import url\("\.\/v333-critical-documents-visual-functional-closeout\.css\?v=333-1"\);/);
  assert.match(css, /\.draft-studio :is\([\s\S]*input:not\(\[type="range"\]\):not\(\[type="color"\]\),select,textarea/);
  assert.match(css, /::-webkit-date-and-time-value/);
  assert.match(css, /-webkit-text-fill-color:var\(--v333-text/);
  assert.doesNotMatch(css, /\.draft-studio-scroll[\s\S]{0,180}overflow-y/);
  assert.match(recovery, /\.draft-studio-scroll\{[\s\S]*overflow-y:auto!important/);
  assert.match(recovery, /touch-action:pan-y!important/);
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

test('printable templates keep dark-header contrast and footer-zone signature/stamp anchoring', async () => {
  const css = await read('src/styles/v330-template-contrast-guard.css');
  const base = await read('src/styles/document-premium-redesign-v141.css');
  assert.match(css, /\.invoice-page\.template-executive \.header-executive[\s\S]*color:#fff!important/);
  assert.match(css, /\.invoice-page \.final-details\{[\s\S]*flex:1 1 auto!important/);
  assert.match(css, /\.invoice-page \.bottom-grid\{[\s\S]*margin-top:auto!important[\s\S]*padding-top:5mm!important/);
  assert.match(css, /\.signature-media \.stamp-image\{[\s\S]*object-position:center bottom!important/);
  assert.match(base, /\.doc-body\{[^}]*display:flex[^}]*flex-direction:column/);
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

test('v333 visual layers do not own business persistence or accounting', async () => {
  const commercial = await read('src/styles/v330-template-contrast-guard.css');
  const draft = await read('src/styles/v333-critical-documents-visual-functional-closeout.css');
  const combined = `${commercial}\n${draft}`;
  assert.doesNotMatch(combined, /firebase|indexedDB|localStorage|saveVault|calculateTotals|invoicePaymentSummary|persist\(/i);
});
