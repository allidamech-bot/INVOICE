import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v366 contrast guard loads after canonical premium document CSS',async()=>{
  const html=await read('index.html');
  const canonical=html.indexOf('./styles/document-premium-redesign-v141.css');
  const guard=html.indexOf('./styles/template-surface-contrast-v366.css');
  assert.ok(canonical>=0&&guard>canonical);
});

test('effective commercial papers include the later Obsidian graphite override only',async()=>{
  const [appearance,v330]=await Promise.all([read('src/lib/appearance.ts'),read('src/styles/v330-critical-documents-closeout.css')]);
  assert.match(appearance,/TEMPLATE_PAPERS/);
  assert.match(appearance,/obsidian:'#15191c'/);
  assert.match(appearance,/DARK_BODY_TEMPLATES=new Set<TemplateId>\(\['obsidian','noir','midnight','blackivory','carbon'\]\)/);
  for(const [id,paper] of Object.entries({noir:'#121212',midnight:'#071824',blackivory:'#14130f',carbon:'#1b1d20'}))assert.match(appearance,new RegExp(`${id}:'${paper}'`));
  assert.match(v330,/\.template-obsidian \{ --paper:#15191c;--ink:#f5f1e9;--muted:#aeb5ba;--rule:#343a3f;--soft:#20262a; \}/);
});

test('latest-main local-surface and inverse-total protections remain intact',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page \.party-block\{color:var\(--lrx-surface-ink,var\(--lrx-light-ink\)\)!important;\}/);
  assert.match(css,/\.invoice-pages>\.invoice-page:is\(\.template-midnight,\.template-carbon\) \.totals-block\{color:var\(--lrx-dark-ink\)!important;\}/);
  assert.match(css,/\.invoice-pages>\.invoice-page\.template-obsidian \.totals-block\{color:var\(--lrx-dark-ink\)!important;\}/);
});

test('hybrid light-sheet Auto body copy cannot regress to inverse ink',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  const hybrid='\\.invoice-page:is\\(\\.template-noir,\\.template-midnight,\\.template-blackivory,\\.template-carbon\\)';
  assert.match(css,new RegExp(`${hybrid} :is\\(\\.items-table tbody td[\\s\\S]*\\.terms-block \\.term-row>span[\\s\\S]*\\.bank-block>div>span\\)\\{color:var\\(--lrx-primary`));
  assert.match(css,new RegExp(`${hybrid} :is\\(\\.terms-block \\.term-row>b,\\.bank-block>div>b,\\.doc-footer\\)\\{color:var\\(--lrx-secondary`));
  assert.match(css,new RegExp(`${hybrid} :is\\(\\.terms-block h3[\\s\\S]*\\.continued-label\\)\\{color:var\\(--lrx-heading`));
  assert.doesNotMatch(css,new RegExp(`${hybrid}[^\\n]*\\.totals-block`));
});

test('Carbon dark-body zebra rows cannot inherit the global light stripe',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page\.template-carbon \.items-table tbody tr:nth-child\(even\)\{[\s\S]*background:var\(--soft,#24282b\)!important;/);
});

test('custom light-body roles are semantic and contrast guarded',async()=>{
  const [appearance,css]=await Promise.all([read('src/lib/appearance.ts'),read('src/styles/template-surface-contrast-v366.css')]);
  assert.match(appearance,/safeTextColor/);
  assert.match(appearance,/TEMPLATE_LIGHT_SURFACES/);
  assert.match(css,/\.invoice-page\.palette-custom:not\(\.template-obsidian\) \.party-block\{color:var\(--lrx-primary/);
  assert.match(css,/\.party-name/);
  assert.match(css,/\.party-contact/);
});

test('Obsidian Auto and Custom protect light cards and dark body copy independently',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page\.template-obsidian \.party-block\{color:var\(--lrx-surface-ink/);
  assert.match(css,/template-obsidian \.party-block :is\(\.party-address,\.party-location,\.party-contact,\.party-identifiers\)\{color:var\(--lrx-surface-muted/);
  assert.match(css,/template-obsidian :is\(\.items-table tbody td[\s\S]*\.terms-block \.term-row>span[\s\S]*\.bank-block>div>span\)\{color:var\(--lrx-primary/);
  assert.match(css,/template-obsidian :is\(\.terms-block \.term-row>b,\.bank-block>div>b,\.doc-footer\)\{color:var\(--lrx-secondary/);
  assert.match(css,/template-obsidian \.signature-media\{background:#fff!important;[\s\S]*padding:2mm!important/);
  assert.match(css,/template-obsidian \.signature-image\{filter:none!important;mix-blend-mode:normal!important;\}/);
  assert.doesNotMatch(css,/template-obsidian \.signature-image[^\n]*invert\(/);
});

test('Auto keeps semantic hierarchy while every local surface keeps authored inverse contrast',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/Auto foreground is semantic and surface-aware/);
  assert.match(css,/\.invoice-page\.palette-auto:not\(\.template-obsidian\)[\s\S]*color:var\(--lrx-primary,#17212b\)!important/);
  assert.match(css,/\.invoice-page\.palette-auto:not\(\.template-obsidian\)[\s\S]*color:var\(--lrx-secondary,#4d5b68\)!important/);
  assert.match(css,/\.invoice-page\.palette-auto:not\(\.template-obsidian\)[\s\S]*color:var\(--lrx-heading/);
  assert.match(css,/\.invoice-page\.palette-auto\.template-obsidian \.party-block[\s\S]*--lrx-surface-ink/);
  assert.match(css,/\.invoice-page\.palette-auto\.template-obsidian[\s\S]*--lrx-secondary,#aeb5ba/);
  assert.match(css,/Deliberately absent: custom foreground rules/);
  assert.doesNotMatch(css,/\.invoice-page\.palette-custom \.items-table thead th[^\n]*--lrx/);
  assert.doesNotMatch(css,/\.invoice-page\.palette-custom \.totals-block[^\n]*color:var\(--lrx/);
});

test('Normal typography preserves the effective shipped cascade and template-specific hierarchy',async()=>{
  const [css,v364]=await Promise.all([read('src/styles/template-surface-contrast-v366.css'),read('src/styles/v364-document-template-layout-refinement.css')]);
  assert.match(v364,/\.invoice-page :is\(\.terms-block,\.bank-block,\.signature-block,\.notes-block\)>h3\{[\s\S]*font-size:6\.8px;/);
  assert.match(css,/\.invoice-page \.doc-title\{zoom:1;\}/);
  assert.match(css,/\.invoice-page\.template-executive\{--lrx-title-base:28px;\}/);
  assert.match(css,/\.invoice-page\.page-first :is\(\.header-executive,\.header-minimal,\.header-trade,\.header-signature,\.header-modern\) \.doc-title>span\{font-size:calc\(var\(--lrx-title-base,25px\)\*var\(--lrx-title-scale,1\)\)!important;\}/);
  assert.match(css,/\.invoice-page\.page-first\.lang-bilingual[\s\S]*--lrx-title-secondary-base,20px/);
  assert.match(css,/\.invoice-page :is\(\.terms-block h3,\.notes-block h3,\.bank-block h3,\.signature-block h3\)\{font-size:var\(--lrx-heading-size,7\.8px\)!important;/);
  assert.match(css,/\.invoice-page \.continued-label\{font-size:calc\(var\(--lrx-heading-size,7\.8px\)\*\.955882\)!important;/);
  assert.doesNotMatch(css,/\.invoice-page \.items-wrap\{font-size:var\(--lrx-heading-size/);
  assert.match(css,/\.invoice-page \.items-table\{font-size:var\(--lrx-table-size,8\.2px\)!important;\}/);
  assert.match(css,/\.invoice-page \.items-table tbody td\{font-size:100%!important/);
  assert.match(css,/template-slate \.items-table thead th\{font-size:calc\(var\(--lrx-table-size,8\.2px\)\*\.813793\)!important;\}/);
  assert.match(css,/template-slate \.items-table tbody td\{font-size:calc\(var\(--lrx-table-size,8\.2px\)\*\.924138\)!important;line-height:1\.3!important;\}/);
  assert.match(css,/template-slate \.items-table tbody td\.description-cell\{font-size:calc\(var\(--lrx-table-size,8\.2px\)\*\.951724\)!important;\}/);
  assert.match(css,/template-editorial \.items-table tbody td\.description-cell\{font-size:calc\(var\(--lrx-table-size,8\.2px\)\*1\.062069\)!important;\}/);
  assert.match(css,/\.invoice-page \.party-block\{font-size:var\(--lrx-body-size,9\.2px\)!important;\}/);
});

test('later receipt output semantics do not bypass bounded table sizing',async()=>{
  const css=await read('src/styles/v332-critical-documents-deep-closeout.css');
  assert.match(css,/kind-payment-receipt\.lang-en \.items-table th:last-child::after\{content:"Amount";font-size:calc\(var\(--lrx-table-size,7\.25px\)\*1\.6552\);\}/);
  assert.match(css,/kind-payment-receipt\.lang-ar \.items-table th:last-child::after\{content:"المبلغ";font-size:calc\(var\(--lrx-table-size,7\.25px\)\*1\.6552\);\}/);
  assert.match(css,/kind-payment-receipt\.lang-bilingual \.items-table th:last-child::after\{content:"Amount \/ المبلغ";font-size:calc\(var\(--lrx-table-size,7\.25px\)\*1\.5632\);\}/);
});