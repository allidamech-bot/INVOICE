import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v589 document studio owner is emitted after Batch 5 flattening',async()=>{
  const bundle=await read('scripts/v485-bundle-visible-ui.mjs');
  const flatten=bundle.indexOf("editorFlatteningGuard.trim()");
  const finalOwner=bundle.indexOf("documentStudioFinalGuard.trim()");
  assert.ok(flatten>=0&&finalOwner>flatten,'final document studio owner must run after Batch 5 flattening');
  assert.match(bundle,/LOUREX v589 — final document studio owner/);
});

test('v589 editor buttons cannot fall back to fixed black or old blue surfaces',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/\.screen-editor \.btn\.btn-primary\{background:var\(--lrx-editor-accent\)!important;background-image:none!important/);
  assert.match(css,/\.screen-editor \.btn\.btn-secondary,[\s\S]*background:var\(--ft-surface\)!important/);
  assert.match(css,/\.screen-editor \.advanced-master-toggle\{[\s\S]*background:var\(--ft-surface\)!important/);
  assert.match(css,/--lrx-editor-accent:var\(--boot-accent,#129da1\)/);
});

test('v589 Design section has one visual hierarchy instead of nested card layers',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/:is\(\.design-advanced-panel,\.document-design-stack,\.document-design-group,\.document-design-rows,\.appearance-system-grid,\.watermark-editor-card,\.watermark-editor-head,\.watermark-editor-body\)\{background:transparent!important/);
  assert.match(css,/\.document-design-row\{background:transparent!important;box-shadow:none!important/);
  assert.match(css,/\.document-color-control,[\s\S]*background:var\(--ft-surface\)!important/);
});

test('v589 strengthens the two live-observed dark-template contrast weaknesses',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/\.invoice-page\.template-blackivory\{--rule:#837665;\}/);
  assert.match(css,/\.template-blackivory \.items-table tbody td\{border-bottom-color:#6f6557!important;\}/);
  assert.match(css,/\.invoice-page\.template-noir\{--rule:#765f3f;\}/);
  assert.match(css,/\.template-noir \.section-kicker\{color:#e0bd78!important/);
});
