import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const templates=['executive','minimal','trade','signature','obsidian','cobalt','editorial','split','prism','slate','horizon','mono','aurora','ledger','noir','midnight','blackivory','carbon'];

test('canonical document design is the only active A4 visual layer',async()=>{
  const [html,build,sw]=await Promise.all([read('index.html'),read('scripts/build.mjs'),read('public/sw.js')]);
  const styles=[...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  assert.equal(styles.at(-1),'document-premium-redesign-v141.css');
  for(const retired of ['document-art-direction-v120.css','document-palette-v121.css','document-dark-contrast-v126.css','document-flagship-v128.css','document-template-system-v129.css','document-final-qa-v130.css','document-layout-cleanup-v140.css','document-template-distinction-v143.css'])assert.equal(styles.includes(retired),false,retired);
  assert.match(build,/styleNames\.at\(-1\)!=='document-premium-redesign-v141\.css'/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v146'/);
});

test('all 18 templates own an explicit independent art direction',async()=>{
  const css=await read('src/styles/document-premium-redesign-v141.css');
  for(const id of templates){
    assert.match(css,new RegExp(`\/\\* \\d{2} [^*]+ \\*\/[\\s\\S]*?\\.template-${id}\\b`),id);
    assert.match(css,new RegExp(`\\.template-${id}[^\\n]*\\.items-table`),`${id}: table`);
  }
  assert.match(css,/Executive — multinational corporate luxury/);
  assert.match(css,/Editorial — financial-journal typography and rules/);
  assert.match(css,/Midnight Navy — LOUREX flagship/);
});

test('A4, item table, totals, bank and signature use bounded flow-safe grids',async()=>{
  const [css,renderer]=await Promise.all([read('src/styles/document-premium-redesign-v141.css'),read('src/templates/TemplateRenderer.tsx')]);
  assert.match(css,/@page\{size:A4;margin:0\}/);
  assert.match(css,/width:210mm;height:297mm/);
  assert.match(css,/\.items-table\{width:100%;border-collapse:collapse;table-layout:fixed\}/);
  assert.match(renderer,/<colgroup>/);
  assert.match(css,/\.grand-total\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css,/data-bank="iban"/);
  assert.match(css,/\.signature-media\{[^}]*display:grid/);
  assert.doesNotMatch(css,/\.party-block::before|\.party-block::after|\.header-modern::before|\.header-modern::after/);
});

test('continuation pages replace repeated hero headers and preserve pagination',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/function ContinuationHeader/);
  assert.match(renderer,/!firstPage\?<ContinuationHeader/);
  assert.match(renderer,/firstPage&&variant === 'executive'/);
  assert.match(renderer,/page-continued/);
  assert.match(renderer,/paginateItems/);
});

test('RTL and bilingual documents receive explicit mirrored semantics',async()=>{
  const [css,renderer]=await Promise.all([read('src/styles/document-premium-redesign-v141.css'),read('src/templates/TemplateRenderer.tsx')]);
  assert.match(renderer,/dir=\{doc\.language==='ar'\?'rtl':'ltr'\}/);
  assert.match(css,/\.invoice-page\.lang-ar \.items-table\{direction:rtl\}/);
  assert.match(css,/\.template-split\.lang-ar \.header-modern/);
  assert.match(css,/\.template-noir\.lang-ar \.header-modern/);
  assert.match(css,/\.template-carbon\.lang-ar \.modern-title/);
  assert.match(css,/\.invoice-page\.lang-bilingual \.bi-value/);
});

test('dark identities remain light commercial paper with print-safe mastheads',async()=>{
  const css=await read('src/styles/document-premium-redesign-v141.css');
  assert.match(css,/\.template-noir\{--paper:#fffdf8/);
  assert.match(css,/\.template-midnight\{--paper:#fcfaf4/);
  assert.match(css,/\.template-blackivory\{--paper:#fbf6eb/);
  assert.match(css,/\.template-carbon\{--paper:#fafafa/);
  assert.match(css,/-webkit-print-color-adjust:exact/);
  assert.doesNotMatch(css,/\.template-(?:noir|midnight|blackivory|carbon)\{[^}]*--paper:#(?:0|1|2)/);
});
