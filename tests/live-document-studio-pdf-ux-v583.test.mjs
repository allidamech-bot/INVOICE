import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('live v583 loads the semantic PDF contrast owner after document closeout layers',async()=>{
  const html=await read('index.html');
  const closeout=html.indexOf('./styles/v332-critical-documents-deep-closeout.css');
  const guard=html.indexOf('./styles/template-surface-contrast-v366.css?v=366-2');
  assert.ok(closeout>=0&&guard>closeout,'surface contrast must be the final commercial document color guard');
});

test('live v583 Auto PDF colors keep primary secondary and heading roles independent',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(appearance,/const primary=custom\?[\s\S]*:defaultPrimary;/);
  assert.match(appearance,/const secondary=custom\?[\s\S]*:defaultSecondary;/);
  assert.match(appearance,/const heading=custom\?[\s\S]*:autoHeading;/);
  assert.doesNotMatch(appearance,/AUTO_LIGHT_TEXT|AUTO_DARK_TEXT/);
  assert.match(css,/Auto foreground is semantic and surface-aware/);
  assert.match(css,/--lrx-primary,#17212b/);
  assert.match(css,/--lrx-secondary,#4d5b68/);
  assert.match(css,/--lrx-heading/);
});

test('live v583 short quotations keep their commercial close anchored at the page foot',async()=>{
  const owner=await read('scripts/v544-pdf-a4-output-emergency.mjs');
  assert.match(owner,/nth-child\(-n\+3\):last-child\) \.final-details\{margin-top:auto!important;padding-top:2\.4mm;\}/);
  assert.doesNotMatch(owner,/nth-child\(-n\+3\):last-child\) \.final-details\{margin-top:8mm/);
});

test('live v583 normal PDF typography is readable instead of the historical tiny cascade',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(appearance,/sectionHeadingScale\?\?'normal',\.78/);
  assert.match(appearance,/bodyTextScale\?\?legacyScale,1,/);
  assert.match(appearance,/tableTextScale\?\?legacyScale,8\.2\/9\.1/);
  assert.match(css,/--lrx-heading-size,7\.8px/);
  assert.match(css,/--lrx-body-size,9\.2px/);
  assert.match(css,/--lrx-table-size,8\.2px/);
});

test('live v583 editor actions inherit the application palette and section navigation clears sticky chrome',async()=>{
  const css=await read('src/styles/v330-template-contrast-guard.css');
  assert.match(css,/--v333-accent:var\(--ft-accent,#315DA8\)/);
  assert.match(css,/--v333-accent:var\(--ft-accent,#7399E3\)/);
  assert.doesNotMatch(css,/--v333-accent:#4f6ff7|--v333-accent:#7d98ff/);
  assert.match(css,/\.screen-editor :is\(\.editor-actions,\.mobile-action-buttons\) \.btn-primary\{[\s\S]*background:var\(--ft-accent\)!important;[\s\S]*background-image:none!important/);
  assert.match(css,/\.editor-section\{scroll-margin-top:96px!important;\}/);
});

test('live v583 autosave feedback stays calm while persistence is still active',async()=>{
  const [commercial,draft,css]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/components/DraftDocumentEditor.tsx'),
    read('src/styles/v330-template-contrast-guard.css')
  ]);
  assert.match(commercial,/t\('Editing…','قيد التعديل…'\)/);
  assert.match(draft,/t\('Editing…','قيد التعديل…'\)/);
  assert.doesNotMatch(commercial,/Changes not saved yet/);
  assert.doesNotMatch(draft,/Unsaved changes/);
  assert.match(css,/save-indicator\.state-unsaved[\s\S]*color:var\(--ft-muted\)!important/);
});

test('live v583 customer edit modal visibly separates long business sections',async()=>{
  const css=await read('src/styles/v330-template-contrast-guard.css');
  assert.match(css,/\.modal \.ta-customer-form-section\{[\s\S]*border:1px solid var\(--ft-line\)!important;[\s\S]*border-radius:14px!important/);
  assert.match(css,/\.ta-customer-form-section>header\{[\s\S]*border-bottom:1px solid var\(--ft-line\)!important/);
});
