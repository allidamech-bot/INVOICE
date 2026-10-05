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

test('v366 explicitly protects light quotation body copy from inverse text leakage',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/template-executive[\s\S]*template-carbon/);
  assert.match(css,/items-table tbody td[\s\S]*--lrx-light-ink/);
  assert.match(css,/-webkit-text-fill-color:[^;]*--lrx-light-ink/);
});

test('v366 keeps light cards readable inside obsidian dark body',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page \.party-block[\s\S]*--lrx-light-ink/);
  assert.match(css,/\.template-obsidian[\s\S]*--lrx-dark-ink/);
});

test('hybrid dark-header identities stay on light-sheet body colors',async()=>{
  const [css,appearance]=await Promise.all([read('src/styles/template-surface-contrast-v366.css'),read('src/lib/appearance.ts')]);
  for(const id of ['noir','midnight','blackivory','carbon'])assert.match(css,new RegExp(`template-${id}`));
  assert.match(appearance,/const DARK_TEMPLATES=new Set<TemplateId>\(\['obsidian'\]\)/);
  assert.match(css,/template-carbon\) :is\(\.items-table tbody[\s\S]*--lrx-light-ink/);
});

test('v366 prevents microscopic item and party copy in preview and print',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/items-table tbody td\{font-size:max\(calc\(7\.4px \* var\(--doc-text-scale,1\)\),calc\(1em \* var\(--doc-text-scale,1\)\)\)!important/);
  assert.match(css,/party-address[\s\S]*font-size:max\(calc\(7\.6px \* var\(--doc-text-scale,1\)\),calc\(1em \* var\(--doc-text-scale,1\)\)\)!important/);
  assert.match(css,/@media print/);
});

test('design customization stays in the existing Design section and remains bounded',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  assert.match(editor,/section-heading[\s\S]{0,120}06[\s\S]{0,120}Design/);
  assert.match(editor,/Color System[\s\S]{0,500}paletteMode/);
  assert.match(editor,/Auto — matched to template/);
  assert.match(editor,/Custom Accent/);
  assert.match(editor,/English Font[\s\S]{0,400}LATIN_FONT_OPTIONS/);
  assert.match(editor,/Arabic Font[\s\S]{0,400}ARABIC_FONT_OPTIONS/);
});

test('design controls are mobile-safe and do not add navigation or header UI',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/design-advanced-panel[\s\S]*min-height:44px/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*appearance-system-grid\{grid-template-columns:1fr!important/);
  assert.doesNotMatch(css,/\.editor-topbar[^\n]*content:/);
  assert.doesNotMatch(css,/\.app-sidebar[^\n]*content:/);
});
