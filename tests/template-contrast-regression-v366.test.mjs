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

test('v366 assigns commercial terms labels and values from canonical document tokens',async()=>{
  const [renderer,css]=await Promise.all([
    read('src/templates/TemplateRenderer.tsx'),
    read('src/styles/template-surface-contrast-v366.css')
  ]);
  assert.match(renderer,/className="term-row"/);
  assert.match(renderer,/--lrx-primary/);
  assert.match(renderer,/--lrx-secondary/);
  assert.match(css,/\.terms-block \.term-row>b\{color:var\(--lrx-secondary/);
  assert.match(css,/\.terms-block \.term-row>span\{color:var\(--lrx-primary/);
});

test('v366 keeps light commercial cards readable for every template identity',async()=>{
  const [appearance,css]=await Promise.all([
    read('src/lib/appearance.ts'),
    read('src/styles/template-surface-contrast-v366.css')
  ]);
  assert.match(appearance,/const page='#fffdf8'/);
  assert.match(appearance,/const defaultPrimary='#17212b'/);
  assert.match(appearance,/const darkSurfaceInk='#fffaf0'/);
  assert.match(css,/\.invoice-page \.party-block\{color:var\(--lrx-primary/);
  assert.match(css,/\.party-contact/);
});

test('v366 preserves authored dark-module contrast instead of repainting totals and table headers',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/Do not globally override table-header or totals text colors/);
  const semanticBody=css.match(/\/\* Light body semantic roles[\s\S]*?\/\*[\s\S]*?The Commercial Terms DOM/);
  assert.ok(semanticBody);
  assert.doesNotMatch(semanticBody[0],/items-table thead th\{/);
  assert.doesNotMatch(semanticBody[0],/totals-block strong/);
});

test('v366 prevents microscopic item and party copy while allowing bounded user sizing',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/items-table tbody td\{font-size:max\(7\.4px,var\(--lrx-table-size,9\.1px\)\)!important/);
  assert.match(css,/party-address[\s\S]*font-size:max\(7\.6px,var\(--lrx-body-size,9\.2px\)\)!important/);
  assert.match(css,/@media print/);
});

test('design customization stays in section 06 and exposes the agreed controls',async()=>{
  const [editor,controls]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/components/DocumentDesignControls.tsx')
  ]);
  assert.match(editor,/section-heading[\s\S]{0,120}06[\s\S]{0,120}Design/);
  assert.match(editor,/DocumentDesignControls appearance=\{d\.appearance\} onChange=\{this\.appearance\}/);
  assert.match(controls,/Auto — matched to template/);
  assert.match(controls,/Accent Color/);
  assert.match(controls,/Heading Color/);
  assert.match(controls,/Primary Text/);
  assert.match(controls,/Secondary Text \/ Labels/);
  assert.match(controls,/English Font/);
  assert.match(controls,/Arabic Font/);
  assert.match(controls,/Document Title Size/);
  assert.match(controls,/Section Heading Size/);
  assert.match(controls,/Body \/ Values Size/);
  assert.match(controls,/Table Text Size/);
});

test('design controls are mobile-safe and do not add navigation or header UI',async()=>{
  const [css,controls]=await Promise.all([
    read('src/styles/template-surface-contrast-v366.css'),
    read('src/components/DocumentDesignControls.tsx')
  ]);
  assert.match(css,/design-advanced-panel[\s\S]*min-height:44px/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*appearance-system-grid\{grid-template-columns:1fr!important/);
  assert.doesNotMatch(controls,/workspace-sidebar|bottom-nav|editor-topbar/);
});
