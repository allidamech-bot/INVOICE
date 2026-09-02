import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const allTemplates=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

test('v130 final QA loads last after both redesign batches',async()=>{
  const [html,qa]=await Promise.all([
    read('index.html'),
    read('src/styles/document-final-qa-v130.css')
  ]);
  const flagship=html.indexOf('document-flagship-v128.css');
  const batch2=html.indexOf('document-template-system-v129.css');
  const finalQa=html.indexOf('document-final-qa-v130.css');
  assert.ok(flagship>=0&&batch2>flagship&&finalQa>batch2,'v130 must be the final document design layer');
  assert.match(qa,/final LOUREX quotation\/invoice design QA/);
  assert.doesNotMatch(qa,/\.app-shell|\.documents-page|\.editor-shell/);
});

test('all 18 templates are covered by the combined v128 and v129 art direction',async()=>{
  const [flagship,batch2,selector]=await Promise.all([
    read('src/styles/document-flagship-v128.css'),
    read('src/styles/document-template-system-v129.css'),
    read('src/templates/TemplateThumbnails.tsx')
  ]);
  const combined=flagship+'\n'+batch2;
  assert.equal(allTemplates.length,18);
  for(const id of allTemplates){
    assert.match(combined,new RegExp(`template-${id}`),`art direction missing: ${id}`);
    assert.ok(selector.includes(`id: '${id}'`),`selector missing: ${id}`);
  }
});

test('retired full-dark sheets cannot leak legacy dark foreground into light bodies',async()=>{
  const qa=await read('src/styles/document-final-qa-v130.css');
  for(const id of ['midnight','blackivory','noir','carbon']){
    assert.match(qa,new RegExp(`template-${id}\\.document-tone-dark`),`legacy tone reset missing: ${id}`);
  }
  assert.match(qa,/color-scheme:light/);
  assert.match(qa,/not\(:first-child\):is\(\.template-midnight,\.template-blackivory,\.template-noir,\.template-carbon\) \.header-modern/);
  assert.match(qa,/background:transparent!important/);
  assert.match(qa,/\.doc-meta span\{\s*color:#1d2931!important/);
});

test('template selector previews match the redesigned light-body dark identities and teal prism',async()=>{
  const qa=await read('src/styles/document-final-qa-v130.css');
  for(const id of ['obsidian','midnight','noir','carbon','blackivory']){
    assert.match(qa,new RegExp(`template-preview-${id}`),`preview correction missing: ${id}`);
  }
  const prism=qa.slice(qa.indexOf('.template-preview-prism'),qa.indexOf('.template-preview-obsidian'));
  assert.match(prism,/#4c7773/);
  assert.doesNotMatch(prism,/#8465b3|#6f64ce|purple|violet|magenta/i);
  assert.match(qa,/template-preview-midnight[\s\S]*--mock-paper:#fbfaf6/);
  assert.match(qa,/template-preview-noir[\s\S]*--mock-paper:#fbfaf6/);
  assert.match(qa,/template-preview-carbon[\s\S]*--mock-paper:#fbfaf7/);
});

test('real commercial data has final overflow and numeric stability guardrails',async()=>{
  const qa=await read('src/styles/document-final-qa-v130.css');
  assert.match(qa,/\.doc-meta span,\.party-contact,\.party-identifiers span,\.bank-block span/);
  assert.match(qa,/overflow-wrap:anywhere/);
  assert.match(qa,/\.money-cell,\.total-row strong,\.grand-total strong/);
  assert.match(qa,/white-space:nowrap/);
  assert.match(qa,/font-variant-numeric:tabular-nums/);
  assert.match(qa,/\.items-table th \.bi-label/);
  assert.match(qa,/\.lang-bilingual \.items-table th/);
});

test('closing zone and footer stay intentional under sparse optional data',async()=>{
  const qa=await read('src/styles/document-final-qa-v130.css');
  assert.match(qa,/\.bottom-grid:empty\{\s*display:none!important/);
  assert.match(qa,/\.bottom-grid>\.bank-block:only-child/);
  assert.match(qa,/\.bottom-grid>\.signature-block:only-child/);
  assert.match(qa,/\.doc-footer>span:first-child/);
  assert.match(qa,/text-overflow:ellipsis/);
  assert.match(qa,/max-width:78%/);
});

test('pagination, bottom anchoring, RTL isolation and print break protections remain intact',async()=>{
  const [renderer,output,direction,qa,sw]=await Promise.all([
    read('src/templates/TemplateRenderer.tsx'),
    read('src/styles/document-output-v119.css'),
    read('src/styles/document-direction-v78.css'),
    read('src/styles/document-final-qa-v130.css'),
    read('public/sw.js')
  ]);
  assert.match(renderer,/shouldUseDetailsPage/);
  assert.match(renderer,/hardOverflow/);
  assert.match(renderer,/lastWeight>allowedLastWeight/);
  assert.match(output,/\.invoice-page:not\(\.details-only\) \.final-details\{\s*margin-top:auto!important/);
  assert.match(direction,/unicode-bidi:isolate/);
  assert.match(direction,/\.invoice-page\.lang-ar/);
  assert.match(qa,/@media print/);
  assert.match(qa,/break-inside:avoid/);
  assert.match(sw,/pathname\.startsWith\('\/styles\/'\)/);
  assert.match(sw,/networkFirst\(event\.request\)/);
});