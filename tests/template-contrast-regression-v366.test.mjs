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

test('v366 targets current commercial terms markup in Custom color mode',async()=>{
  const [renderer,css]=await Promise.all([read('src/templates/TemplateRenderer.tsx'),read('src/styles/template-surface-contrast-v366.css')]);
  assert.match(renderer,/className="term-row"/);
  assert.match(renderer,/--lrx-primary/);
  assert.match(renderer,/--lrx-secondary/);
  assert.match(css,/\.invoice-page\.palette-custom \.terms-block \.term-row>b\{color:var\(--lrx-secondary/);
  assert.match(css,/\.invoice-page\.palette-custom \.terms-block \.term-row>span\{color:var\(--lrx-primary/);
});

test('Auto keeps authored template palettes and models the later Obsidian dark-body override',async()=>{
  const [appearance,css,premium,v330]=await Promise.all([read('src/lib/appearance.ts'),read('src/styles/template-surface-contrast-v366.css'),read('src/styles/document-premium-redesign-v141.css'),read('src/styles/v330-critical-documents-closeout.css')]);
  assert.match(appearance,/TEMPLATE_PAPERS/);
  assert.match(appearance,/obsidian:'#15191c'/);
  assert.match(appearance,/DARK_BODY_TEMPLATES=new Set<TemplateId>\(\['obsidian'\]\)/);
  assert.match(appearance,/noir:'#fffdf8'/);
  assert.match(appearance,/midnight:'#fcfaf4'/);
  assert.match(appearance,/blackivory:'#fbf6eb'/);
  assert.match(appearance,/carbon:'#fafafa'/);
  assert.match(premium,/\.template-obsidian\{--paper:#fff/);
  assert.match(v330,/\.template-obsidian \{ --paper:#15191c;--ink:#f5f1e9;--muted:#aeb5ba;--rule:#343a3f;--soft:#20262a; \}/);
  assert.match(css,/Auto means matched to the selected template/);
  assert.doesNotMatch(css,/\.invoice-page\.palette-auto\s/);
});

test('Custom light-body roles preserve dark modules and do not leak page ink into Obsidian cards',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page\.palette-custom:not\(\.template-obsidian\) \.party-block\{color:var\(--lrx-primary/);
  assert.match(css,/\.invoice-page\.palette-custom :is\(\.items-table tbody td/);
  assert.match(css,/\.invoice-page\.template-obsidian \.party-block\{color:var\(--lrx-surface-ink/);
  assert.match(css,/\.invoice-page\.template-obsidian :is\(\.items-table tbody td/);
  assert.match(css,/Deliberately absent: custom foreground rules/);
  const customBody=css.match(/\/\* Custom semantic foreground roles[\s\S]*?\/\* The current Commercial Terms DOM/);
  assert.ok(customBody);
  assert.doesNotMatch(customBody[0],/items-table thead/);
  assert.doesNotMatch(customBody[0],/totals-block/);
});

test('Obsidian signature compatibility is dark-surface aware without recoloring stamps',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/template-obsidian \.signature-image:not\(\[src\^="data:image\/jpeg"\]\)[\s\S]*invert\(1\)/);
  assert.match(css,/template-obsidian \.signature-image\[src\^="data:image\/jpeg"\][\s\S]*mix-blend-mode:screen/);
  const obsidianBlock=css.slice(css.indexOf('Signature is ink on the graphite body'),css.indexOf('Deliberately absent'));
  assert.doesNotMatch(obsidianBlock,/stamp-image/);
});

test('Normal typography is an effective-production no-op and bounded controls preserve hierarchy',async()=>{
  const [css,appearance]=await Promise.all([read('src/styles/template-surface-contrast-v366.css'),read('src/lib/appearance.ts')]);
  assert.match(appearance,/headingScale=scaleValue\(appearance\?\.sectionHeadingScale\?\?'normal',\.68,\.94,1\.08\)/);
  assert.match(appearance,/bodyScale=scaleValue\(appearance\?\.bodyTextScale\?\?legacyScale,8\.2\/9\.2,\.95,1\.06\)/);
  assert.match(appearance,/tableScale=scaleValue\(appearance\?\.tableTextScale\?\?legacyScale,7\.25\/9\.1,\.95,1\.05\)/);
  assert.match(css,/terms-block h3,[\s\S]*font-size:var\(--lrx-heading-size,6\.8px\)!important/);
  assert.match(css,/items-table\{font-size:var\(--lrx-table-size,7\.25px\)!important;\}/);
  assert.match(css,/items-table tbody td\{font-size:100%!important/);
  assert.match(css,/items-table tbody td\.description-cell\{font-size:104\.138%!important/);
  assert.match(css,/items-table tbody td\.trade-cell\{font-size:93\.793%!important/);
  assert.match(css,/party-block\{font-size:var\(--lrx-body-size,8\.2px\)!important;\}/);
  assert.match(css,/term-row>span,[\s\S]*bank-block>div>span\{font-size:85\.366%!important/);
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
