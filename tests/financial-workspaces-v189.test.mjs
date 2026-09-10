import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v189 loads the financial workspace layer late without displacing printable document CSS',async()=>{
  const [html,css,build]=await Promise.all([
    read('index.html'),
    read('src/styles/financial-workspaces-v189.css'),
    read('scripts/build.mjs')
  ]);
  assert.ok(html.includes('./styles/financial-workspaces-v189.css'));
  assert.ok(html.indexOf('account-cloud-separation-v186.css')<html.indexOf('financial-workspaces-v189.css'));
  assert.ok(html.indexOf('financial-workspaces-v189.css')<html.indexOf('document-premium-redesign-v141.css'));
  assert.match(build,/styleNames\.at\(-1\)!=='document-premium-redesign-v141\.css'/);
  assert.match(css,/Batch 7 — Obsidian Executive financial workspaces/);
  assert.match(css,/@media screen/);
  assert.ok(!css.includes('@media print'),'financial workspace redesign must not override print media');
  assert.ok(!css.includes('customer-statement-print'),'customer statement paper remains isolated');
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
