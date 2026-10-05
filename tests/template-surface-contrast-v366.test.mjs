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
  assert.match(appearance,/DARK_BODY_TEMPLATES=new Set<TemplateId>\(\['obsidian'\]\)/);
  assert.match(appearance,/noir:'#fffdf8'/);
  assert.match(appearance,/midnight:'#fcfaf4'/);
  assert.match(appearance,/blackivory:'#fbf6eb'/);
  assert.match(appearance,/carbon:'#fafafa'/);
  assert.match(v330,/\.template-obsidian \{ --paper:#15191c;--ink:#f5f1e9;--muted:#aeb5ba;--rule:#343a3f;--soft:#20262a; \}/);
});

test('custom light-body roles are semantic and contrast guarded',async()=>{
  const [appearance,css]=await Promise.all([read('src/lib/appearance.ts'),read('src/styles/template-surface-contrast-v366.css')]);
  assert.match(appearance,/safeTextColor/);
  assert.match(appearance,/const surfaceInk='#17212b'/);
  assert.match(css,/\.invoice-page\.palette-custom:not\(\.template-obsidian\) \.party-block\{color:var\(--lrx-primary/);
  assert.match(css,/\.party-name/);
  assert.match(css,/\.party-contact/);
  assert.match(css,/--lrx-secondary/);
});

test('Obsidian Auto and Custom both protect light cards and dark body copy independently',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page\.template-obsidian \.party-block\{color:var\(--lrx-surface-ink/);
  assert.match(css,/template-obsidian \.party-block :is\(\.party-address,\.party-location,\.party-contact,\.party-identifiers\)\{color:var\(--lrx-surface-muted/);
  assert.match(css,/template-obsidian :is\(\.items-table tbody td[\s\S]*\.terms-block \.term-row>span[\s\S]*\.bank-block>div>span\)\{color:var\(--lrx-primary/);
  assert.match(css,/template-obsidian :is\(\.terms-block \.term-row>b,\.bank-block>div>b,\.doc-footer\)\{color:var\(--lrx-secondary/);
  assert.match(css,/template-obsidian \.signature-image:not\(\[src\^="data:image\/jpeg"\]\)/);
  assert.match(css,/template-obsidian \.signature-image\[src\^="data:image\/jpeg"\]/);
});

test('Auto and authored dark local modules are not flattened by Custom foreground rules',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/Auto means matched to the selected template/);
  assert.match(css,/Deliberately absent: custom foreground rules/);
  assert.doesNotMatch(css,/\.invoice-page\.palette-auto\s/);
  assert.doesNotMatch(css,/\.invoice-page\.palette-custom \.items-table thead th[^\n]*--lrx/);
  assert.doesNotMatch(css,/\.invoice-page\.palette-custom \.totals-block[^\n]*color:var\(--lrx/);
});

test('typography scaling keeps canonical normal sizes and role hierarchy',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page \.items-table\{font-size:var\(--lrx-table-size,7\.25px\)!important;\}/);
  assert.match(css,/\.invoice-page \.items-table thead th\{font-size:87\.586%!important;\}/);
  assert.match(css,/\.invoice-page \.items-table tbody td\{font-size:100%!important/);
  assert.match(css,/\.invoice-page \.party-block\{font-size:var\(--lrx-body-size,8\.2px\)!important;\}/);
  assert.match(css,/\.invoice-page \.notes-block p\{font-size:84\.146%!important/);
});

test('later receipt output semantics do not bypass bounded table sizing',async()=>{
  const css=await read('src/styles/v332-critical-documents-deep-closeout.css');
  assert.match(css,/kind-payment-receipt\.lang-en \.items-table th:last-child::after\{content:"Amount";font-size:calc\(var\(--lrx-table-size,7\.25px\)\*1\.6552\);\}/);
  assert.match(css,/kind-payment-receipt\.lang-ar \.items-table th:last-child::after\{content:"المبلغ";font-size:calc\(var\(--lrx-table-size,7\.25px\)\*1\.6552\);\}/);
  assert.match(css,/kind-payment-receipt\.lang-bilingual \.items-table th:last-child::after\{content:"Amount \/ المبلغ";font-size:calc\(var\(--lrx-table-size,7\.25px\)\*1\.5632\);\}/);
});
