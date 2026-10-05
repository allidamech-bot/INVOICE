import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v366 contrast guard is loaded after canonical premium output styles',async()=>{
  const html=await read('index.html');
  const premium=html.indexOf('document-premium-redesign-v141.css');
  const guard=html.indexOf('template-surface-contrast-v366.css');
  assert.ok(premium>=0&&guard>premium,'contrast guard must load after canonical premium A4 CSS');
});

test('v366 targets current commercial terms markup only in Custom color mode',async()=>{
  const [renderer,css]=await Promise.all([read('src/templates/TemplateRenderer.tsx'),read('src/styles/template-surface-contrast-v366.css')]);
  assert.match(renderer,/className="term-row"/);
  assert.match(renderer,/--lrx-primary/);
  assert.match(renderer,/--lrx-secondary/);
  assert.match(css,/\.invoice-page\.palette-custom \.terms-block \.term-row>b\{color:var\(--lrx-secondary/);
  assert.match(css,/\.invoice-page\.palette-custom \.terms-block \.term-row>span\{color:var\(--lrx-primary/);
});

test('Auto keeps canonical template palettes instead of flattening them',async()=>{
  const [appearance,css,premium]=await Promise.all([read('src/lib/appearance.ts'),read('src/styles/template-surface-contrast-v366.css'),read('src/styles/document-premium-redesign-v141.css')]);
  assert.match(appearance,/TEMPLATE_PAPERS/);
  assert.match(appearance,/noir:'#fffdf8'/);
  assert.match(appearance,/midnight:'#fcfaf4'/);
  assert.match(appearance,/blackivory:'#fbf6eb'/);
  assert.match(appearance,/carbon:'#fafafa'/);
  assert.match(premium,/\.template-noir\{--paper:#fffdf8/);
  assert.match(premium,/\.template-midnight\{--paper:#fcfaf4/);
  assert.match(css,/Auto means matched to the selected template/);
  assert.doesNotMatch(css,/\.invoice-page\.palette-auto\s/);
});

test('Custom body roles stay light-surface scoped and preserve dark-module contrast',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page\.palette-custom \.party-block\{color:var\(--lrx-primary/);
  assert.match(css,/\.invoice-page\.palette-custom :is\(\.items-table tbody td/);
  assert.match(css,/Deliberately absent: custom foreground rules/);
  const customBody=css.match(/\/\* Custom semantic foreground roles[\s\S]*?\/\* The current Commercial Terms DOM/);
  assert.ok(customBody);
  assert.doesNotMatch(customBody[0],/items-table thead/);
  assert.doesNotMatch(customBody[0],/totals-block/);
});

test('v366 prevents microscopic item and party copy while allowing bounded user sizing',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/items-table tbody td\{font-size:max\(7\.4px,var\(--lrx-table-size,9\.1px\)\)!important/);
  assert.match(css,/party-address[\s\S]*font-size:max\(7\.6px,var\(--lrx-body-size,9\.2px\)\)!important/);
  assert.match(css,/@media print/);
});

test('design customization stays in section 06 and exposes the agreed bounded controls',async()=>{
  const [editor,controls]=await Promise.all([read('src/components/EditorPageCore.tsx'),read('src/components/DocumentDesignControls.tsx')]);
  assert.match(editor,/section-heading[\s\S]{0,120}06[\s\S]{0,120}Design/);
  assert.match(editor,/DocumentDesignControls appearance=\{d\.appearance\} onChange=\{this\.appearance\}/);
  assert.match(controls,/Auto — matched to template/);
  assert.match(controls,/Accent \/ Highlight/);
  assert.match(controls,/Section Heading Color/);
  assert.match(controls,/Primary Text \/ Values/);
  assert.match(controls,/Secondary Text \/ Labels/);
  assert.match(controls,/English Font/);
  assert.match(controls,/Arabic Font/);
  assert.match(controls,/Document Title Size/);
  assert.match(controls,/Section Heading Size/);
  assert.match(controls,/Body \/ Values Size/);
  assert.match(controls,/Table Text Size/);
});

test('design controls are mobile-safe and do not add navigation or header UI',async()=>{
  const [css,controls]=await Promise.all([read('src/styles/template-surface-contrast-v366.css'),read('src/components/DocumentDesignControls.tsx')]);
  assert.match(css,/design-advanced-panel[\s\S]*min-height:44px/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*appearance-system-grid\{grid-template-columns:1fr!important/);
  assert.doesNotMatch(controls,/workspace-sidebar|bottom-nav|editor-topbar/);
});
