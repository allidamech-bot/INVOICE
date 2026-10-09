import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current finance and operations owners stay screen-only and preserve A4 print output',async()=>{
 const [html,legacy,finance,operations,build]=await Promise.all([
  read('index.html'),read('src/styles/financial-workspaces-v189.css'),read('src/styles/tailadmin-finance-v320.css'),read('src/styles/tailadmin-operations-v320.css'),read('scripts/build.mjs')
 ]);
 const paper=html.indexOf('document-premium-redesign-v141.css');
 const financeAt=html.indexOf('tailadmin-finance-v320.css');
 const opsAt=html.indexOf('tailadmin-operations-v320.css');
 assert.ok(paper>=0&&financeAt>paper&&opsAt>financeAt,'current application styling follows canonical print foundation');
 assert.equal(html.includes('financial-workspaces-v189.css'),false,'retired financial style must not override approved TailAdmin');
 for(const css of [legacy,finance,operations]){
  assert.match(css,/@media screen/);
  assert.doesNotMatch(css,/@media print|\.invoice-page/,'finance chrome must not overwrite commercial paper');
 }
 assert.match(build,/app\.bundle\.css/);
});
test('v189 gives reports a compact command surface and financial hierarchy instead of white card stacks',async()=>{
  const css=await read('src/styles/financial-workspaces-v189.css');
  for(const selector of [
    '.reports-filter-panel','.reports-presets','.reports-currency-grid','.report-currency-card',
    '.report-primary-metrics','.report-secondary-metrics','.reports-panel','.reports-table th'
  ])assert.ok(css.includes(selector),selector);
  assert.match(css,/\.reports-currency-grid\{[^}]*gap:1px[^}]*border:1px solid var\(--ds-line\)/s);
  assert.match(css,/\.report-currency-card\{[^}]*background:linear-gradient\(145deg,var\(--ds-financial-surface\),var\(--ds-surface\)\)/s);
  assert.match(css,/\.reports-table th\{[^}]*position:sticky[^}]*background:var\(--ds-workspace\)/s);
  assert.ok(!/\.report-currency-card\{[^}]*#fff/s.test(css));
});

test('v189 turns receivables into one financial rail plus operational account and aging panels',async()=>{
  const css=await read('src/styles/financial-workspaces-v189.css');
  for(const selector of [
    '.receivable-currency-cards','.receivable-currency-card','.receivable-primary','.aging-panel',
    '.receivable-accounts-panel','.receivable-account-row','.receivable-controls','.aging-table th'
  ])assert.ok(css.includes(selector),selector);
  assert.match(css,/\.receivable-currency-cards\{[^}]*gap:1px/s);
  assert.match(css,/\.receivable-account-row:hover\{background:rgba\(39,170,163,\.055\)\}/);
  assert.match(css,/\[dir="rtl"\] \.app-ui \.receivable-account-row\.has-overdue/);
});

test('v189 rebuilds operations as a dark ledger workspace with flat lists and semantic state',async()=>{
  const css=await read('src/styles/financial-workspaces-v189.css');
  for(const selector of [
    '.operations-summary','.operations-tabs','.operations-list-panel','.operations-editor',
    '.operation-row','.purchase-total-strip','.inventory-table','.status-posted','.status-reversed'
  ])assert.ok(css.includes(selector),selector);
  assert.match(css,/\.operations-summary\{[^}]*gap:1px[^}]*background:var\(--ds-line\)/s);
  assert.match(css,/\.operation-row\{[^}]*border-bottom:1px solid var\(--ds-line\)[^}]*background:transparent/s);
  assert.match(css,/\.operations-tabs button\.active\{[^}]*box-shadow:inset 0 -2px 0 var\(--ds-accent-bright\)/s);
});

test('v189 protects phone density, RTL and touch-safe financial controls',async()=>{
  const css=await read('src/styles/financial-workspaces-v189.css');
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(css,/font-size:16px!important/);
  assert.match(css,/padding-bottom:96px/);
  assert.match(css,/\[dir="rtl"\] \.app-ui :is\(\.reports-heading,\.receivables-heading,\.operations-hero/);
  assert.ok(!css.includes('width:100vw'),'viewport-width chrome would reintroduce mobile horizontal overflow');
});
