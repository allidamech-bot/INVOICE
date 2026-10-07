import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('global application overlays consume the single canonical LOUREX z-index ladder',async()=>{
  const [bridge,shell,overlays,documents,ai,preview]=await Promise.all([
    read('src/styles/tailadmin-reliability-bridge-v320.css'),
    read('src/styles/tailadmin-shell-v320.css'),
    read('src/styles/tailadmin-overlays-v320.css'),
    read('src/styles/tailadmin-documents-v320.css'),
    read('src/styles/tailadmin-ai-v320.css'),
    read('src/styles/mobile-preview-v156.css')
  ]);

  for(const token of [
    '--lourex-z-shell:60',
    '--lourex-z-nav:120',
    '--lourex-z-editor-dock:900',
    '--lourex-z-backdrop:1100',
    '--lourex-z-popover:1120',
    '--lourex-z-sheet:1140',
    '--lourex-z-assistant-trigger:1180',
    '--lourex-z-search:1200',
    '--lourex-z-ai:1220',
    '--lourex-z-modal:1300',
    '--lourex-z-toast:1360',
    '--lourex-z-preview:1400',
    '--lourex-z-critical:1500'
  ])assert.ok(bridge.includes(token),`missing canonical layer token ${token}`);

  assert.match(shell,/\.ta-sidebar\s*\{[\s\S]*?z-index:var\(--lourex-z-shell,60\)!important/);
  assert.match(shell,/\.ta-create-menu\s*\{[\s\S]*?z-index:var\(--lourex-z-popover,1120\)!important/);
  assert.match(shell,/\.ta-overlay-backdrop\s*\{[\s\S]*?z-index:var\(--lourex-z-backdrop,1100\)!important/);
  assert.match(shell,/\.ta-mobile-nav\s*\{[\s\S]*?z-index:var\(--lourex-z-nav,120\)!important/);
  assert.match(shell,/\.ta-create-menu-mobile\s*\{[\s\S]*?z-index:var\(--lourex-z-popover,1120\)!important/);
  assert.match(shell,/\.ta-mobile-sheet\s*\{[\s\S]*?z-index:var\(--lourex-z-sheet,1140\)!important/);

  assert.match(overlays,/\.modal-backdrop\{[^}]*z-index:var\(--lourex-z-modal,1300\)!important/);
  assert.match(overlays,/\.toast\{[^}]*z-index:var\(--lourex-z-toast,1360\)!important/);
  assert.match(overlays,/\.global-search-backdrop\{[^}]*z-index:var\(--lourex-z-search,1200\)!important/);
  assert.match(overlays,/\.global-search-panel\{[^}]*z-index:calc\(var\(--lourex-z-search,1200\) \+ 1\)!important/);

  assert.match(documents,/\.ta-doc-action-popover \{[^}]*z-index:var\(--lourex-z-popover,1120\)!important/);
  assert.match(documents,/\.app-ui\.ta-doc-mobile-action-portal \{[^}]*z-index:var\(--lourex-z-critical,1500\)!important/);

  assert.match(ai,/\.lourex-ai-launcher\{[\s\S]*?z-index:var\(--lourex-z-assistant-trigger,1180\)!important/);
  assert.match(ai,/\.lourex-ai-backdrop\{[^}]*z-index:calc\(var\(--lourex-z-ai,1220\) - 1\)!important/);
  assert.match(ai,/\.lourex-ai-panel\{[\s\S]*?z-index:var\(--lourex-z-ai,1220\)!important/);
  assert.match(preview,/\.mobile-preview-overlay\{[\s\S]*?z-index:var\(--lourex-z-preview,1400\)!important/);
});

test('AI fixed descendants use a component-local ladder instead of masquerading as global app layers',async()=>{
  const [composer,stage3,stage4,design2]=await Promise.all([
    read('public/ai-composer-v449.css'),
    read('scripts/ai-conversation-owner-stage3.mjs'),
    read('scripts/ai-conversation-owner-stage4-accessibility.mjs'),
    read('scripts/ai-conversation-design-batch2.mjs')
  ]);

  for(const token of [
    '--lourex-ai-local-z-attachment:55',
    '--lourex-ai-local-z-scope:96',
    '--lourex-ai-local-z-sheet-backdrop:120',
    '--lourex-ai-local-z-sheet:121',
    '--lourex-ai-local-z-sheet-top:122'
  ])assert.ok(composer.includes(token),`missing AI-local layer token ${token}`);

  assert.match(stage3,/z-index:var\(--lourex-ai-local-z-attachment,55\)!important/);
  assert.match(stage3,/z-index:var\(--lourex-ai-local-z-sheet-backdrop,120\)/);
  assert.match(stage3,/z-index:var\(--lourex-ai-local-z-sheet,121\)!important/);
  assert.match(stage4,/z-index:var\(--lourex-ai-local-z-sheet-top,122\)!important/);
  assert.match(design2,/z-index:var\(--lourex-ai-local-z-scope,96\)!important/);

  for(const source of [stage3,stage4,design2]){
    assert.doesNotMatch(source,/z-index\s*:\s*149[0-9]/,'AI internals must not claim global 149x layers');
  }
  assert.doesNotMatch(design2,/z-index\s*:\s*1400/,'AI scope menu must not claim the application preview layer');
});


test('active foundational and editor owners do not reintroduce competing global layer numbers',async()=>{
  const [app,documentPreview,attachments,editorCore,contrastGuard,draftRecovery]=await Promise.all([
    read('src/styles/app.css'),
    read('src/styles/document-premium-redesign-v141.css'),
    read('src/styles/tailadmin-attachments-v320.css'),
    read('src/styles/tailadmin-editor-core-v320.css'),
    read('src/styles/v330-template-contrast-guard.css'),
    read('src/styles/v331-draft-scroll-recovery.css')
  ]);

  assert.match(app,/\.modal-backdrop\{position:fixed;inset:0;z-index:var\(--lourex-z-modal,1300\)/);
  assert.match(app,/\.toast\{position:fixed;right:22px;bottom:22px;z-index:var\(--lourex-z-toast,1360\)/);
  assert.match(app,/\.mobile-preview-overlay\{position:fixed;inset:0;z-index:var\(--lourex-z-preview,1400\)/);
  assert.match(app,/\.new-menu,.action-menu,.customer-dropdown\{[^}]*z-index:var\(--lourex-z-popover,1120\)/);

  assert.match(documentPreview,/\.mobile-preview-open \.mobile-preview-overlay\{[^}]*z-index:var\(--lourex-z-preview,1400\)/);
  assert.match(attachments,/\.attachment-preview-overlay\{[^}]*z-index:var\(--lourex-z-preview,1400\)!important/);
  assert.doesNotMatch(attachments,/z-index:214748\d+/,'runtime attachment previews must not bypass the application ladder');

  assert.match(editorCore,/\.draft-mobile-actionbar\{position:fixed!important;z-index:var\(--lourex-z-editor-dock,900\)!important/);
  assert.match(contrastGuard,/\.screen-editor \.lourex-ai-launcher\{[\s\S]*?z-index:var\(--lourex-z-assistant-trigger,1180\)!important/);
  assert.equal((draftRecovery.match(/z-index:var\(--lourex-z-editor-dock,900\)!important/g)||[]).length,2);
});
