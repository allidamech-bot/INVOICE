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

test('document renderer preserves Arabic and bilingual direction semantics',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/doc\.language === 'ar'/);
  assert.match(renderer,/doc\.language === 'en'/);
  assert.match(renderer,/dir="rtl"/);
  assert.match(renderer,/bi-label/);
  assert.match(renderer,/bi-value/);
  assert.match(renderer,/doc-title-primary-ar/);
});

test('A4 and multi-page print guardrails remain present for every template',async()=>{
  const [documentCss,appCss,renderer,documents]=await Promise.all([
    read('src/styles/document.css'),read('src/styles/app.css'),read('src/templates/TemplateRenderer.tsx'),read('src/lib/documents.ts')
  ]);
  assert.match(documentCss,/width:210mm;height:297mm/);
  assert.match(appCss,/@media print/);
  assert.match(appCss,/page-break-after:always/);
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
