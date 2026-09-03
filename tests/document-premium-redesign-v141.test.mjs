import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v141 remains the final document style while v142 advances the hardened PWA cache',async()=>{
  const [html,build,sw]=await Promise.all([read('index.html'),read('scripts/build.mjs'),read('public/sw.js')]);
  assert.ok(html.indexOf('document-premium-redesign-v141.css')>html.indexOf('document-layout-cleanup-v140.css'));
  assert.match(build,/styleNames\.at\(-1\)!=='document-premium-redesign-v141\.css'/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v142';$/m);
  assert.ok(sw.includes('"./styles/document-premium-redesign-v141.css"'));
});

test('executive and minimal headers are explicitly light with dark readable typography',async()=>{
  const css=await read('src/styles/document-premium-redesign-v141.css');
  assert.match(css,/template-executive \.header-executive\{[\s\S]*?background:linear-gradient\(180deg,#fff 0%,#fcfaf5 100%\)!important/);
  assert.match(css,/template-executive \.header-executive>\.doc-title,[\s\S]*?color:var\(--v141-navy\)!important/);
  assert.match(css,/template-minimal \.header-minimal\{[\s\S]*?background:#fff!important/);
  assert.match(css,/template-minimal \.doc-title,[\s\S]*?color:#172d40!important/);
});

test('legacy decorative geometry cannot overlap modern header text',async()=>{
  const css=await read('src/styles/document-premium-redesign-v141.css');
  assert.match(css,/\.header-modern \.modern-geometry\{display:none!important\}/);
  assert.match(css,/\.invoice-pages>\.invoice-page:first-child :is\(\.header-modern,\.header-executive,\.header-minimal,\.header-trade,\.header-signature\)\{[\s\S]*?isolation:isolate!important[\s\S]*?overflow:hidden!important/);
  assert.match(css,/\.header-modern \.modern-title\{[\s\S]*?position:relative!important[\s\S]*?z-index:2!important/);
});

test('seller and buyer blocks use real borders without pseudo-elements crossing content',async()=>{
  const css=await read('src/styles/document-premium-redesign-v141.css');
  assert.match(css,/\.invoice-page \.party-block\{[\s\S]*?border:1px solid #e0e4e5!important[\s\S]*?background:#fff!important/);
  assert.match(css,/\.invoice-page \.party-block::before,[\s\S]*?content:none!important;display:none!important/);
  assert.match(css,/\.invoice-page \.party-customer\{[\s\S]*?border-inline-start:1\.1mm solid var\(--v141-gold\)!important/);
});

test('item table has one readable navy header and only light body rows',async()=>{
  const css=await read('src/styles/document-premium-redesign-v141.css');
  assert.match(css,/\.items-table thead th\{[\s\S]*?background:var\(--v141-navy\)!important[\s\S]*?color:#fff!important/);
  assert.match(css,/tbody tr:nth-child\(odd\)\{background:#fff!important/);
  assert.match(css,/tbody tr:nth-child\(even\)\{background:var\(--v141-row\)!important/);
  assert.match(css,/\.items-table tbody td\{[\s\S]*?color:#213642!important/);
});

test('commercial closing area follows content instead of being pinned to A4 bottom',async()=>{
  const css=await read('src/styles/document-premium-redesign-v141.css');
  assert.match(css,/\.invoice-page:not\(\.details-only\) \.final-details\{[\s\S]*?margin-top:6mm!important/);
  assert.match(css,/\.lower-grid\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) minmax\(57mm,63mm\)!important/);
  assert.match(css,/\.grand-total\{[\s\S]*?background:linear-gradient\(115deg,#0d2b40,#143d57\)!important[\s\S]*?color:#fff!important/);
});

test('formerly dark templates are forced onto light commercial paper',async()=>{
  const css=await read('src/styles/document-premium-redesign-v141.css');
  for(const id of ['noir','midnight','blackivory','carbon'])assert.match(css,new RegExp(`template-${id}\\{--v141-template:[^}]+background:#`));
  assert.match(css,/template-noir,.template-midnight,.template-blackivory,.template-carbon\)\.document-tone-dark[\s\S]*?color:var\(--v141-ink\)!important[\s\S]*?background:transparent!important/);
});
