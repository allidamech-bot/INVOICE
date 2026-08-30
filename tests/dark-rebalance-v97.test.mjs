import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v97 dark rebalance stays loaded and ships offline',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const styles=[...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  assert.ok(styles.includes('dark-rebalance-v97.css'));
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/\.\/styles\/dark-rebalance-v97\.css/);
});

test('v97 keeps matte black while restoring layered surfaces and semantic color distinction',async()=>{
  const css=await read('src/styles/dark-rebalance-v97.css');
  assert.match(css,/--v97-bg:#111213/);
  assert.match(css,/--v97-surface:#1b1c1e/);
  assert.match(css,/--v97-surface-raised:#222326/);
  assert.match(css,/--v97-surface-high:#292a2e/);
  assert.match(css,/--v97-gold:#d0a65d/);
  assert.match(css,/--v97-blue:#6497c4/);
  assert.match(css,/--v97-green:#62b48b/);
  assert.match(css,/documents-overview>button:nth-child\(2\)[\s\S]*?#282219/);
  assert.match(css,/documents-overview>button:nth-child\(3\)[\s\S]*?#19232c/);
  assert.match(css,/documents-overview>button:nth-child\(4\)[\s\S]*?#19241e/);
  assert.match(css,/documents-overview>button:nth-child\(5\)[\s\S]*?#272117/);
  assert.match(css,/modal-header,[\s\S]*?background:#232427/);
  assert.match(css,/modal-body\{background:#191a1c/);
});

test('v97 covers authentication and external utility screens that sit outside app-ui',async()=>{
  const css=await read('src/styles/dark-rebalance-v97.css');
  assert.match(css,/\.auth-page\{[\s\S]*?linear-gradient\(145deg,#111213,#0d0e0f\)/);
  assert.match(css,/\.auth-card,.welcome-card,.account-first-card\{[\s\S]*?background:linear-gradient\(160deg,#1e1f21,#191a1c\)/);
  assert.match(css,/\.loading-screen\{[\s\S]*?linear-gradient\(145deg,#101112,#090a0b\)/);
  assert.match(css,/\.logo-touch-editor-sheet\{background:#1b1c1e/);
  assert.match(css,/\.auth-page \.input,[\s\S]*?background:#141517/);
});

test('v97 remains isolated from printable document selectors',async()=>{
  const css=await read('src/styles/dark-rebalance-v97.css');
  assert.doesNotMatch(css,/\.invoice-page|\.document-page|\.a4[-_]/i);
  assert.match(css,/Print layouts are intentionally outside this theme layer/);
});
