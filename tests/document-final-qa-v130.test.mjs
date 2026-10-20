import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const allTemplates=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

test('canonical A4 base remains document-only while v337 is Draft/watermark support only',async()=>{
const [html,css,balance]=await Promise.all([read('index.html'),read('src/styles/document-premium-redesign-v141.css'),read('src/styles/v337-template-layout-balance.css')]);
 assert.match(html,/href="\.\/styles\/document-premium-redesign-v141\.css"/);
 assert.match(css,/Canonical commercial A4 design/);
 assert.match(css,/@page\{size:A4;margin:0\}/);
 assert.match(css,/\.doc-body\{display:flex;flex:1/);
 assert.match(css,/\.final-details\{flex:0 0 auto/);
 assert.doesNotMatch(css,/\.app-shell|\.documents-page|\.editor-shell/);
 assert.doesNotMatch(balance,/\.invoice-page(?:\:not\([^)]*\))? \.final-details\s*\{|\.invoice-page \.bottom-grid\s*\{/);
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

test('pagination, bottom-closing normal flow, RTL isolation and print break protections remain intact',async()=>{
const [renderer,canonical,balance,direction,sw]=await Promise.all([
  read('src/templates/TemplateRenderer.tsx'),read('src/styles/document-premium-redesign-v141.css'),
  read('src/styles/v337-template-layout-balance.css'),read('src/styles/document-direction-v78.css'),read('public/sw.js')
 ]);
 for(const token of ['shouldUseDetailsPage','hardOverflow','lastWeight>allowedLastWeight','data-pagination-ready','getBoundingClientRect'])assert.ok(renderer.includes(token),token);
 assert.match(canonical,/\.doc-body\{[^}]*display:flex;flex:1[^}]*flex-direction:column/);
 assert.match(canonical,/\.final-details\{[^}]*flex:0 0 auto[^}]*margin-top:auto;padding-top:7mm/);
 assert.match(canonical,/\.bottom-grid\{[^}]*margin-top:5mm[^}]*align-items:start/);
 assert.match(canonical,/\.invoice-page\.lang-ar/);
 assert.match(canonical,/@media print/);
 assert.match(canonical,/break-inside:avoid/);
 assert.doesNotMatch(balance,/\.invoice-page(?:\:not\([^)]*\))? \.final-details\s*\{|\.invoice-page \.bottom-grid\s*\{/);
 assert.match(direction,/unicode-bidi:isolate/);
 assert.match(sw,/function isAppRuntimePath\(pathname\)/);
});
