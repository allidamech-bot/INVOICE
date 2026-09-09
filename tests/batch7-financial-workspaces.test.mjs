import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('batch 7 preserves currency-separated receivables and reporting semantics',async()=>{
  const [receivables,reports]=await Promise.all([
    read('src/components/ReceivablesPage.tsx'),
    read('src/components/ReportsPage.tsx')
  ]);
  assert.match(receivables,/receivable-currency-cards/);
  assert.match(receivables,/aging-panel/);
  assert.match(receivables,/CustomerStatementModal/);
  assert.match(reports,/reports-currency-grid/);
  assert.match(reports,/customer-performance-table/);
  assert.match(reports,/Export CSV/);
  assert.doesNotMatch(receivables,/exchangeRate|fxRate|convertCurrency/i);
  assert.doesNotMatch(reports,/exchangeRate|fxRate|convertCurrency/i);
});

test('batch 7 moves all three financial workspaces onto canonical Obsidian surfaces',async()=>{
  const [receivables,reports,operations]=await Promise.all([
    read('src/styles/receivables-v133.css'),
    read('src/styles/reports-v135.css'),
    read('src/styles/operations-v137.css')
  ]);
  for(const [name,css] of Object.entries({receivables,reports,operations})){
    assert.match(css,/var\(--ds-(surface|workspace|line|text)/,`${name} must use canonical design tokens`);
    assert.doesNotMatch(css,/\.template-(executive|minimal|trade|signature|obsidian|cobalt|editorial|split|prism|slate|horizon|mono|aurora|ledger|noir|midnight|blackivory|carbon)/,`${name} must not style printable invoice templates`);
  }
  assert.match(receivables,/receivable-currency-card[\s\S]*var\(--ds-surface/);
  assert.match(reports,/reports-currency-grid[\s\S]*var\(--ds-surface/);
  assert.match(operations,/operations-summary[\s\S]*var\(--ds-surface/);
  assert.match(operations,/purchase-total-strip[\s\S]*var\(--ds-financial-surface/);
});

test('batch 7 keeps overdue and negative financial states semantic rather than decorative',async()=>{
  const [receivables,reports,operations]=await Promise.all([
    read('src/styles/receivables-v133.css'),
    read('src/styles/reports-v135.css'),
    read('src/styles/operations-v137.css')
  ]);
  assert.match(receivables,/aging-alert[\s\S]*var\(--ds-danger-text/);
  assert.match(receivables,/receivable-account-row\.has-overdue[\s\S]*var\(--ds-danger/);
  assert.match(reports,/has-overdue[\s\S]*var\(--ds-danger-text/);
  assert.match(operations,/status-posted[\s\S]*rgba\(54,167,121/);
  assert.match(operations,/is-negative[\s\S]*var\(--ds-danger-text/);
});

test('batch 7 keeps financial tables scan-friendly and mobile workflows reachable',async()=>{
  const [receivables,reports,operations]=await Promise.all([
    read('src/styles/receivables-v133.css'),
    read('src/styles/reports-v135.css'),
    read('src/styles/operations-v137.css')
  ]);
  assert.match(receivables,/aging-table th[\s\S]*position:sticky/);
  assert.match(receivables,/font-variant-numeric:tabular-nums/);
  assert.match(reports,/reports-table-wrap[\s\S]*background:var\(--ds-workspace\)/);
  assert.match(reports,/reports-table th[\s\S]*background:var\(--ds-surface-strong\)/);
  assert.match(reports,/font-variant-numeric:tabular-nums/);
  assert.match(operations,/operations-tabs button[\s\S]*min-height:40px/);
  assert.match(operations,/@media\(max-width:720px\)[\s\S]*operations-tabs button\{min-height:44px/);
  assert.match(operations,/operations-editor-actions[\s\S]*position:sticky/);
});

test('batch 7 canonical layer wins the retained light v152 financial overrides',async()=>{
  const [index,design]=await Promise.all([
    read('index.html'),
    read('src/styles/design-system-v164.css')
  ]);
  assert.ok(index.indexOf('design-system-v164.css')>index.indexOf('ux-recovery-v152.css'),'canonical design layer must load after legacy v152');
  assert.match(design,/Batch 7 financial workspaces/);
  assert.match(design,/\.app-ui \.reports-presets button\{[\s\S]*background:var\(--ds-input\)!important/);
  assert.match(design,/\.app-ui :is\(\.reports-table,\.aging-table\)\{[\s\S]*background:var\(--ds-workspace\)!important/);
  assert.match(design,/\.app-ui \.operations-summary>\*\{[\s\S]*background:transparent!important/);
  assert.match(design,/\.app-ui \.operations-tabs\{[\s\S]*background:var\(--ds-workspace\)!important/);
  assert.match(design,/\.app-ui \.reports-page :is\(input\.input,select\.input,textarea\.input\)\{font-size:16px!important/);
  assert.match(design,/@media\(max-width:390px\)[\s\S]*\.app-ui \.operations-summary\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.doesNotMatch(design,/\.template-(executive|minimal|trade|signature|obsidian|cobalt|editorial|split|prism|slate|horizon|mono|aurora|ledger|noir|midnight|blackivory|carbon)/);
});

test('batch 7 preserves dedicated white-paper financial print outputs',async()=>{
  const [receivables,reports,operations]=await Promise.all([
    read('src/styles/receivables-v133.css'),
    read('src/styles/reports-v135.css'),
    read('src/styles/operations-v137.css')
  ]);
  assert.match(receivables,/@media print[\s\S]*printing-customer-statement[\s\S]*background:#fff!important/);
  assert.match(reports,/@media print[\s\S]*printing-financial-report[\s\S]*background:#fff!important/);
  assert.match(operations,/@media print\{\.operations-page\{display:none!important\}\}/);
});
