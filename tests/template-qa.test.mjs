import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const templates=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];
const read=path=>readFile(path,'utf8');

test('all 18 template identifiers stay aligned across type, selector, renderer and CSS',async()=>{
  const [types,selector,renderer,css]=await Promise.all([read('src/types.ts'),read('src/templates/TemplateThumbnails.tsx'),read('src/templates/TemplateRenderer.tsx'),read('src/styles/document-premium-redesign-v141.css')]);
  assert.equal(templates.length,18);
  for(const id of templates){
    assert.ok(types.includes(`'${id}'`),`type:${id}`);
    assert.ok(selector.includes(`id: '${id}'`),`selector:${id}`);
    assert.ok(renderer.includes(`'${id}'`),`renderer:${id}`);
    assert.match(css,new RegExp(`\\.template-${id}\\b`),`css:${id}`);
  }
});

test('proforma, invoice and credit note share the same semantic renderer',async()=>{
  const [types,renderer,bridge]=await Promise.all([read('src/types.ts'),read('src/templates/TemplateRenderer.tsx'),read('public/ios-print-bridge.js')]);
  assert.match(types,/DocumentKind\s*=\s*[^\n]*'proforma'[^\n]*'invoice'/,'core commercial kinds remain present in the expanded document union');
  assert.match(types,/DocumentRole = 'standard' \| 'credit-note'/,'credit notes must retain the explicit accounting role');
  assert.match(renderer,/kind-\$\{doc\.kind\}/);
  assert.match(renderer,/doc\.role==='credit-note'/);
  assert.match(renderer,/data-kind=\{doc\.kind\}/);
  assert.match(renderer,/data-role=\{doc\.role\}/);
  assert.match(bridge,/\.print-portal \.invoice-page/);
  assert.match(bridge,/nativePrint\(\)/);
  assert.doesNotMatch(bridge,/window\.open\('about:blank'/);
});

test('English, Arabic and bilingual direction semantics are intentional',async()=>{
  const [renderer,css]=await Promise.all([read('src/templates/TemplateRenderer.tsx'),read('src/styles/document-premium-redesign-v141.css')]);
  assert.match(renderer,/doc\.language === 'ar'/);
  assert.match(renderer,/doc\.language === 'en'/);
  assert.match(renderer,/lang-\$\{doc\.language\}/);
  assert.match(renderer,/dir=\{doc\.language==='ar'\?'rtl':'ltr'\}/);
  assert.match(renderer,/bi-label/);
  assert.match(renderer,/bi-value/);
  assert.match(renderer,/doc-title-primary-ar/);
  assert.match(css,/\.invoice-page\.lang-ar\{text-align:right\}/);
  assert.match(css,/\.invoice-page\.lang-bilingual\{direction:ltr;text-align:left\}/);
  assert.match(css,/\.invoice-page\.lang-ar \.items-table\{direction:rtl\}/);
  assert.match(css,/unicode-bidi:isolate/);
});

test('A4, multipage and print guardrails apply to every template',async()=>{
  const [css,renderer,documents]=await Promise.all([read('src/styles/document-premium-redesign-v141.css'),read('src/templates/TemplateRenderer.tsx'),read('src/lib/documents.ts')]);
  assert.match(css,/@page\{size:A4;margin:0\}/);
  assert.match(css,/width:210mm;height:297mm/);
  assert.match(css,/page-break-after:always/);
  assert.match(css,/page-break-inside:avoid/);
  assert.match(renderer,/paginateItems/);
  assert.match(renderer,/totalPages/);
  assert.match(renderer,/finalPage/);
  assert.match(renderer,/ContinuationHeader/);
  assert.match(documents,/finalBudget/);
});

test('signature, stamp, bank and dark-identity paper remain output-safe',async()=>{
  const [css,assetCss]=await Promise.all([read('src/styles/document-premium-redesign-v141.css'),read('src/styles/company-assets.css')]);
  assert.match(css,/\.signature-media/);
  assert.match(css,/\.signature-image/);
  assert.match(css,/\.stamp-image/);
  assert.match(css,/data-bank="iban"/);
  const [finalOwner,appearance]=await Promise.all([
    read('src/styles/v485-visible-ui-corrections.css'),
    read('src/lib/appearance.ts')
  ]);
  for(const [id,paper] of [['noir','#121212'],['midnight','#071824'],['blackivory','#14130f'],['carbon','#1b1d20']]){
    assert.ok(appearance.includes(id+":'"+paper+"'"),id+' resolved palette must match the authored final PDF');
    assert.match(finalOwner,new RegExp('\\.invoice-page\\.template-'+id+'\\s*\\{[\\s\\S]{0,200}?--paper:'+paper),id+' paper must stay genuinely dark');
  }
  assert.match(assetCss,/signature/);
  assert.match(assetCss,/stamp/);
});
