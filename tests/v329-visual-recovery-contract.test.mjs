import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');

test('v329 Document Studio recovery stays visual-only', async () => {
  const css = await read('src/styles/tailadmin-shell-contract-v326.css');
  const start = css.indexOf('/* v329 — Document Studio visual recovery.');
  const end = css.indexOf('/* v329 — printable template hierarchy recovery.');
  assert.ok(start >= 0 && end > start, 'v329 Document Studio block must exist before printable recovery');
  const studio = css.slice(start, end);

  assert.match(studio, /\.app-ui \.editor-section/);
  assert.match(studio, /\.app-ui \.template-card\.selected/);
  assert.match(studio, /\.app-ui \.editor-preview-pane/);

  assert.doesNotMatch(studio, /window\.location|localStorage|indexedDB|firebase|calculateTotals|saveVault/i);
  assert.doesNotMatch(studio, /overflow\s*:\s*(auto|scroll)|position\s*:\s*(fixed|sticky)|height\s*:\s*calc\(|min-height\s*:\s*620px/i);
  assert.doesNotMatch(studio, /\.ta-mobile-nav|\.mobile-preview-overlay|\.editor-layout\s*\{/);
});

test('v329 printable recovery cannot change document geometry or pagination', async () => {
  const css = await read('src/styles/tailadmin-shell-contract-v326.css');
  const marker = css.indexOf('/* v329 — printable template hierarchy recovery.');
  assert.ok(marker >= 0, 'printable recovery marker must exist');
  const printable = css.slice(marker);

  assert.match(printable, /\.invoice-page \.doc-title>span/);
  assert.match(printable, /\.invoice-page \.items-table \.description-cell/);
  assert.match(printable, /\.invoice-page \.grand-total>span/);

  assert.doesNotMatch(printable, /page-break|break-(before|after|inside)|@page|grid-template-columns|width\s*:|height\s*:|min-height\s*:|max-height\s*:|padding\s*:|margin\s*:|font-size\s*:/i);
  assert.doesNotMatch(printable, /\.invoice-page\s*\{/);
});

test('v329 recovery remains downstream of canonical document/editor owners', async () => {
  const [html, css] = await Promise.all([
    read('index.html'),
    read('src/styles/tailadmin-shell-contract-v326.css'),
  ]);
  const printable = html.indexOf('./styles/document-premium-redesign-v141.css');
  const editor = html.indexOf('./styles/tailadmin-editor-core-v320.css');
  const recovery = html.indexOf('./styles/tailadmin-shell-contract-v326.css');
  assert.ok(printable >= 0 && editor >= 0 && recovery > printable && recovery > editor);
  assert.match(css, /printable template hierarchy recovery/);
});
