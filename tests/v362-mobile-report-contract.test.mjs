import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('mobile financial records keep a label for each displayed value', async () => {
  const source = await readFile('src/components/ReportsPage.tsx', 'utf8');
  const cells = [...source.matchAll(/<td\b[^>]*>/g)].map(match => match[0]);
  assert.ok(cells.length >= 12, 'both report tables must contain labeled values');
  for (const cell of cells) {
    assert.match(cell, /\bdata-label=\{t\(/, `missing mobile label: ${cell}`);
  }
  assert.match(source, /aria-pressed=\{this\.state\.preset==='year'\}/);
});

test('mobile report cards stay screen-only and reliability CSS stays last', async () => {
  const [html, styles] = await Promise.all([
    readFile('index.html', 'utf8'),
    readFile('src/styles/premium-ux-coherence-v362.css', 'utf8'),
  ]);
  const visual = html.indexOf('./styles/premium-ux-coherence-v362.css');
  const reliability = html.indexOf('./styles/tailadmin-reliability-bridge-v320.css');
  assert.ok(visual > 0 && reliability > visual);
  assert.match(styles, /^@media screen\s*\{/m);
  assert.match(styles, /\.ta-report-panel \.ta-table td::before\s*\{\s*content:attr\(data-label\)/);
  assert.doesNotMatch(styles, /@media print|@page|\.invoice-page/);
});
