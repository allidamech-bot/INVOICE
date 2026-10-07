import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('Batch 3 uses a single-person glyph for selected customer and supplier identity',async()=>{
  const [ui,editor,purchase]=await Promise.all([
    read('src/components/UI.tsx'),
    read('src/components/EditorPageCore.tsx'),
    read('src/components/PurchaseOrderPartySection.tsx')
  ]);
  assert.match(ui,/\|'user'\|'users'\|/);
  assert.match(ui,/user:<g><circle cx="12" cy="8" r="3\.5"\/>/);
  assert.match(editor,/editor-party-avatar"><Icon name="user" size=\{24\}/);
  assert.doesNotMatch(editor,/editor-party-avatar"><Icon name="users" size=\{19\}/);
  assert.match(purchase,/editor-party-avatar"><Icon name="user" size=\{24\}/);
  assert.doesNotMatch(purchase,/editor-party-avatar"><Icon name="users" size=\{19\}/);
});

test('Batch 3 gives mobile and sidebar brand marks separate visual owners',async()=>{
  const [mobile,product]=await Promise.all([
    read('src/styles/tailadmin-mobile-header-v322.css'),
    read('src/styles/product-os-v451.css')
  ]);
  assert.match(mobile,/\.ta-mobile-brand \.brand\.compact\{[\s\S]*?width:40px!important/);
  assert.match(mobile,/\.ta-mobile-brand \.brand-mark img\{[\s\S]*?opacity:1!important/);
  assert.doesNotMatch(mobile,/\.ta-brand-button \.brand\.compact/);
  assert.doesNotMatch(mobile,/\.ta-brand-button \.brand-mark img/);
  assert.match(product,/\.ta-brand-button \.brand\.compact/);
  assert.match(product,/\.ta-brand-button \.brand\.compact \.brand-mark img/);
});

test('Batch 3 isolates selected-party avatar styling from directory customer avatars',async()=>{
  const [editorCss,editor,purchase]=await Promise.all([
    read('src/styles/tailadmin-editor-core-v320.css'),
    read('src/components/EditorPageCore.tsx'),
    read('src/components/PurchaseOrderPartySection.tsx')
  ]);
  assert.match(editorCss,/\.selected-customer>\.editor-party-avatar\{[^}]*width:44px!important[^}]*height:44px!important/);
  assert.match(editorCss,/\.editor-party-avatar \.icon\{[^}]*width:24px!important[^}]*height:24px!important/);
  assert.doesNotMatch(editorCss,/\.app-ui \.customer-avatar\{/);
  assert.doesNotMatch(editor,/className="customer-avatar"/);
  assert.doesNotMatch(purchase,/className="customer-avatar"/);
});

test('Batch 3 has one canonical overlay ladder with no secondary namespace',async()=>{
  const [reliability,visible]=await Promise.all([
    read('src/styles/tailadmin-reliability-bridge-v320.css'),
    read('src/styles/v485-visible-ui-corrections.css')
  ]);
  for(const token of [
    '--lourex-z-nav:120',
    '--lourex-z-editor-dock:900',
    '--lourex-z-backdrop:1100',
    '--lourex-z-sheet:1140',
    '--lourex-z-ai:1220',
    '--lourex-z-modal:1300',
    '--lourex-z-toast:1360',
    '--lourex-z-preview:1400',
    '--lourex-z-critical:1500'
  ]) assert.ok(reliability.includes(token),`missing canonical layer token ${token}`);

  assert.doesNotMatch(visible,/--lx-ui-layer-/);
  assert.match(visible,/\.modal-backdrop\{z-index:var\(--lourex-z-modal,1300\)!important/);
  assert.match(visible,/#lourex-ai-panel\{z-index:var\(--lourex-z-ai,1220\)!important/);
  assert.match(visible,/\.lourex-ai-backdrop\{z-index:calc\(var\(--lourex-z-ai,1220\) - 1\)!important/);
  assert.match(visible,/\.mobile-editor-actionbar[\s\S]*?z-index:var\(--lourex-z-editor-dock,900\)!important/);
  assert.match(visible,/\.draft-mobile-actionbar[\s\S]*?z-index:var\(--lourex-z-editor-dock,900\)!important/);
});
