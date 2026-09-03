import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('canonical document layer replaces v140 and remains final',async()=>{
  const [html,build,css,sw]=await Promise.all([
    read('index.html'),
    read('scripts/build.mjs'),
    read('src/styles/document-premium-redesign-v141.css'),
    read('public/sw.js')
  ]);
  assert.equal(html.indexOf('document-layout-cleanup-v140.css'),-1);
  assert.equal([...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].at(-1)?.[1],'document-premium-redesign-v141.css');
  assert.match(build,/styleNames\.at\(-1\)!=='document-premium-redesign-v141\.css'/);
  assert.ok(sw.includes('"./styles/document-premium-redesign-v141.css"'));
  assert.match(css,/canonical A4 layer/);
});

test('v140 removes the large dead gap and normalizes the closing zone',async()=>{
  const css=await read('src/styles/document-layout-cleanup-v140.css');
  assert.match(css,/\.invoice-page:not\(\.details-only\) \.final-details\s*\{[^}]*margin-top:8mm!important/s);
  assert.doesNotMatch(css,/\.invoice-page:not\(\.details-only\) \.final-details\s*\{[^}]*margin-top:auto/s);
  assert.match(css,/\.invoice-page \.lower-grid\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(58mm,64mm\)!important/s);
  assert.match(css,/\.invoice-page \.totals-block\s*\{[^}]*overflow:hidden!important/s);
  assert.match(css,/\.invoice-page \.grand-total\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) auto!important/s);
});

test('v140 prevents party and table collision regressions',async()=>{
  const css=await read('src/styles/document-layout-cleanup-v140.css');
  assert.match(css,/\.invoice-page \.party-grid\s*\{[^}]*repeat\(2,minmax\(0,1fr\)\)!important/s);
  assert.match(css,/\.invoice-page \.party-block::before\s*\{[^}]*content:none!important/s);
  assert.match(css,/\.invoice-page \.party-block::after\s*\{[^}]*content:none!important/s);
  assert.match(css,/\.invoice-page \.items-table tbody tr:nth-child\(even\)\s*\{[^}]*background:var\(--v140-soft\)!important/s);
  assert.match(css,/\.invoice-page \.items-table tbody td\s*\{[^}]*color:var\(--v140-ink\)!important/s);
  assert.match(css,/\.invoice-page \.items-table \.description-cell\s*\{[^}]*overflow-wrap:anywhere!important/s);
});

test('v140 stabilizes all header families without absolute content positioning',async()=>{
  const css=await read('src/styles/document-layout-cleanup-v140.css');
  for(const selector of ['header-modern','header-executive','header-minimal','header-trade','header-signature']){
    assert.ok(css.includes(selector),`missing ${selector} cleanup`);
  }
  assert.match(css,/\.header-modern \.modern-brand\s*\{[^}]*position:relative!important[^}]*transform:none!important/s);
  assert.match(css,/\.header-modern \.modern-title\s*\{[^}]*position:relative!important[^}]*transform:none!important/s);
  assert.match(css,/\.header-modern \.modern-meta\s*\{[^}]*position:relative!important[^}]*transform:none!important/s);
});

test('v140 keeps mobile preview and print output intentional',async()=>{
  const css=await read('src/styles/document-layout-cleanup-v140.css');
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.app-ui \.mobile-preview-stage/);
  assert.match(css,/@media print[\s\S]*\.invoice-page \.items-table tbody tr/);
  assert.match(css,/page-break-inside:avoid/);
});
