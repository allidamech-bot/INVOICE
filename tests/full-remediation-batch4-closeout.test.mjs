import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('Batch 4 locks autosave semantic company stability',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.match(editor,/function sameEditorCompany\(a:CompanySettings,b:CompanySettings\):boolean/);
  assert.match(editor,/for\(const key of COMPANY_SCALAR_KEYS\)if\(a\[key\]!==b\[key\]\)return false/);
  assert.match(editor,/JSON\.stringify\(a\.bank\)===JSON\.stringify\(b\.bank\)/);
  assert.match(editor,/private stableEditorCompany:CompanySettings/);
});

test('Batch 4 locks deterministic bilingual fragment and technical direction isolation',async()=>{
  const [renderer,css]=await Promise.all([
    read('src/templates/TemplateRenderer.tsx'),
    read('src/styles/document-output-quality-v157.css')
  ]);
  assert.match(renderer,/className="bidi-fragment bidi-en" lang="en" dir="ltr"/);
  assert.match(renderer,/className="bidi-fragment bidi-ar" lang="ar" dir="rtl"/);
  assert.match(css,/\.invoice-page \.bidi-en\{direction:ltr!important;text-align:left!important\}/);
  assert.match(css,/\.invoice-page \.bidi-ar\{[\s\S]*?direction:rtl!important/);
  assert.match(css,/\.invoice-page\.lang-bilingual :is\(\.money-cell,\.quantity-cell[\s\S]*?direction:ltr!important/);
});

test('Batch 4 locks selected party identity and mobile brand ownership',async()=>{
  const [ui,editor,purchase,mobile]=await Promise.all([
    read('src/components/UI.tsx'),
    read('src/components/EditorPageCore.tsx'),
    read('src/components/PurchaseOrderPartySection.tsx'),
    read('src/styles/tailadmin-mobile-header-v322.css')
  ]);
  assert.match(ui,/\|'user'\|'users'\|/);
  assert.match(editor,/editor-party-avatar"><Icon name="user" size=\{24\}/);
  assert.match(purchase,/editor-party-avatar"><Icon name="user" size=\{24\}/);
  assert.match(mobile,/\.ta-mobile-brand \.brand-mark img\{[\s\S]*?width:40px!important[\s\S]*?opacity:1!important/);
  assert.doesNotMatch(mobile,/\.ta-brand-button \.brand\.compact/);
});

test('Batch 4 locks one canonical application z-index ladder',async()=>{
  const [bridge,visible]=await Promise.all([
    read('src/styles/tailadmin-reliability-bridge-v320.css'),
    read('src/styles/v485-visible-ui-corrections.css')
  ]);
  for(const token of [
    '--lourex-z-shell:60','--lourex-z-nav:120','--lourex-z-editor-dock:900',
    '--lourex-z-backdrop:1100','--lourex-z-popover:1120','--lourex-z-sheet:1140',
    '--lourex-z-search:1200','--lourex-z-ai:1220','--lourex-z-modal:1300',
    '--lourex-z-toast:1360','--lourex-z-preview:1400','--lourex-z-critical:1500'
  ])assert.ok(bridge.includes(token),`missing canonical layer token ${token}`);
  assert.doesNotMatch(visible,/--lx-ui-layer-/);
  assert.match(visible,/z-index:var\(--lourex-z-editor-dock,900\)!important/);
  assert.match(visible,/z-index:var\(--lourex-z-modal,1300\)!important/);
  assert.match(visible,/z-index:var\(--lourex-z-ai,1220\)!important/);
});


test('Batch 4 keeps mobile editor sheets below the contextual AI overlay',async()=>{
  const css=await read('src/styles/mobile-ux-functional-hardening-v363.css');
  assert.match(css,/\.ta-product-layout:has\(>\.ta-product-editor\.is-open\)::before\{[\s\S]*?z-index:calc\(var\(--lourex-z-sheet,1140\) - 1\)!important/);
  assert.match(css,/\.ta-product-editor\.is-open\{[\s\S]*?z-index:var\(--lourex-z-sheet,1140\)!important/);
  assert.match(css,/\.ta-ops-split:has\(>\.ta-ops-editor\)::before\{[\s\S]*?z-index:calc\(var\(--lourex-z-sheet,1140\) - 1\)!important/);
  assert.match(css,/\.ta-ops-split>\.ta-ops-editor\{[\s\S]*?z-index:var\(--lourex-z-sheet,1140\)!important/);
  assert.doesNotMatch(css,/\.ta-product-editor\.is-open\{[\s\S]{0,240}?z-index:var\(--lourex-z-modal,1300\)!important/);
});

test('Batch 4 keeps one production CSS bundle plus the proven standalone allowlist',async()=>{
  const contract=await read('tests/batch6-css-runtime-ownership-closeout.test.mjs');
  assert.match(contract,/styles\/app\.bundle\.css/);
  assert.match(contract,/styles\/v331-draft-scroll-recovery\.css/);
  assert.match(contract,/styles\/v332-critical-documents-deep-closeout\.css/);
  assert.match(contract,/styles\/v482-mobile-ux-repair\.css/);
  assert.match(contract,/domain CSS one canonical app\.bundle owner/);
});
