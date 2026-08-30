import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const templates=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];
const dark=['noir','midnight','blackivory','carbon'];
const read=path=>readFile(path,'utf8');

test('all 18 template identifiers stay aligned across types, selector and renderer',async()=>{
  const [types,selector,renderer]=await Promise.all([
    read('src/types.ts'),read('src/templates/TemplateThumbnails.tsx'),read('src/templates/TemplateRenderer.tsx')
  ]);
  assert.equal(templates.length,18);
  for(const id of templates){
    assert.ok(types.includes(`'${id}'`),`type:${id}`);
    assert.ok(selector.includes(`id: '${id}'`),`selector:${id}`);
    assert.ok(renderer.includes(`'${id}'`),`renderer:${id}`);
  }
  for(const id of dark)assert.ok(renderer.includes(`'${id}'`),`dark:${id}`);
  assert.match(renderer,/FULL_DARK_TEMPLATES/);
});

test('every proforma and invoice uses the same shared A4 renderer and output-fix layers',async()=>{
  const [types,renderer,html,typography,direction,bridge,sw]=await Promise.all([
    read('src/types.ts'),
    read('src/templates/TemplateRenderer.tsx'),
    read('index.html'),
    read('src/styles/document-typography-v76.css'),
    read('src/styles/document-direction-v78.css'),
    read('public/ios-print-bridge.js'),
    read('public/sw.js')
  ]);

  assert.match(types,/DocumentKind\s*=\s*'proforma'\s*\|\s*'invoice'/);
  assert.match(renderer,/kind-\$\{doc\.kind\}/);
  assert.match(renderer,/doc\.kind === 'proforma' \? 'PROFORMA INVOICE' : 'INVOICE'/);

  // These layers target .invoice-page, not one document kind or one template,
  // so the same fixes cover both document kinds and all 18 templates.
  assert.match(typography,/\.invoice-page\s*\{/);
  assert.match(direction,/\.invoice-page\s*\{direction:ltr/);
  assert.doesNotMatch(typography,/\.kind-proforma|\.kind-invoice/);
  assert.doesNotMatch(direction,/\.kind-proforma|\.kind-invoice/);

  assert.match(html,/styles\/document-typography-v76\.css/);
  assert.match(html,/styles\/document-direction-v78\.css/);
  assert.match(sw,/document-typography-v76\.css/);
  assert.match(sw,/document-direction-v78\.css/);

  // iPhone output now prints the same in-page portal instead of copying the
  // document into a backgrounded about:blank tab, so preview and PDF share the
  // exact same renderer and stylesheet cascade.
  assert.match(bridge,/\.print-portal \.invoice-page/);
  assert.match(bridge,/nativePrint\(\)/);
  assert.doesNotMatch(bridge,/window\.open\('about:blank'/);
});

test('document renderer preserves English, Arabic and bilingual direction semantics',async()=>{
  const [renderer,direction,typography]=await Promise.all([
    read('src/templates/TemplateRenderer.tsx'),
    read('src/styles/document-direction-v78.css'),
    read('src/styles/document-typography-v76.css')
  ]);
  assert.match(renderer,/doc\.language === 'ar'/);
  assert.match(renderer,/doc\.language === 'en'/);
  assert.match(renderer,/lang-\$\{doc\.language\}/);
  assert.match(renderer,/dir="rtl"/);
  assert.match(renderer,/bi-label/);
  assert.match(renderer,/bi-value/);
  assert.match(renderer,/doc-title-primary-ar/);
  assert.match(direction,/\.invoice-page\.lang-en\{direction:ltr/);
  assert.match(direction,/\.invoice-page\.lang-ar\{direction:rtl/);
  assert.match(direction,/\.invoice-page\.lang-bilingual\{direction:ltr/);
  assert.doesNotMatch(direction,/\.invoice-page\.lang-bi(?:\W|$)/);
  assert.match(direction,/\.invoice-page\.lang-ar \.items-table\{direction:rtl\}/);
  assert.match(direction,/\.invoice-page\.lang-bilingual \.items-table\{direction:ltr\}/);
  assert.match(direction,/unicode-bidi:isolate/);
  assert.match(typography,/\.invoice-page\.lang-bilingual/);
  assert.doesNotMatch(typography,/\.invoice-page\.lang-bi(?:\W|$)/);
});

test('A4 and multi-page print guardrails remain present for every template',async()=>{
  const [documentCss,appCss,direction,renderer,documents]=await Promise.all([
    read('src/styles/document.css'),read('src/styles/app.css'),read('src/styles/document-direction-v78.css'),read('src/templates/TemplateRenderer.tsx'),read('src/lib/documents.ts')
  ]);
  assert.match(documentCss,/width:210mm;height:297mm/);
  assert.match(appCss,/@media print/);
  assert.match(appCss,/page-break-after:always/);
  assert.match(direction,/@page\{size:A4;margin:0\}/);
  assert.match(direction,/page-break-inside:avoid/);
  assert.match(renderer,/paginateItems/);
  assert.match(renderer,/totalPages/);
  assert.match(renderer,/finalPage/);
  assert.match(documents,/finalBudget/);
});

test('signature, stamp and dark-template contrast guardrails survive the final pass',async()=>{
  const [system,darkCss,assetCss]=await Promise.all([
    read('src/styles/document-system.css'),read('src/styles/templates-dark.css'),read('src/styles/company-assets.css')
  ]);
  for(const id of dark){
    assert.ok(system.includes(`template-${id}`),`system contrast:${id}`);
    assert.ok(darkCss.includes(`template-${id}`),`dark css:${id}`);
  }
  assert.match(system,/signature-image/);
  assert.match(system,/stamp-image/);
  assert.match(assetCss,/signature/);
  assert.match(assetCss,/stamp/);
});