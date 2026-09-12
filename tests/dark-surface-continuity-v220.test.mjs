import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v220 replaces the remaining light cloud-conflict surface',async()=>{
  const css=await read('src/styles/dark-surface-continuity-v220.css');
  assert.match(css,/@media screen/);
  assert.match(css,/\.app-ui \.cloud-conflict-banner/);
  assert.match(css,/\.app-ui \.cloud-conflict-recovery/);
  assert.match(css,/background:linear-gradient\([^;]+var\(--ds-surface\)/);
  assert.match(css,/\.app-ui \.cloud-conflict-icon[\s\S]*background:#301f24!important/);
  assert.doesNotMatch(css,/#fff4f0|#f7d9d2/);
});

test('v220 gives every final-review state an Obsidian surface',async()=>{
  const css=await read('src/styles/dark-surface-continuity-v220.css');
  for(const selector of [
    '.issue-review-status',
    '.issue-review-purpose',
    '.issue-review-grid>div',
    '.issue-total-check',
    '.issue-asset-checks>span',
    '.issue-warning',
    '.issue-clean'
  ])assert.ok(css.includes(selector),selector);
  assert.match(css,/\.modal:has\(\.issue-review\)>\.modal-body[\s\S]*var\(--ds-workspace\)/);
  assert.doesNotMatch(css,/background:\s*(?:#fff|#f[0-9a-f]{5})/i);
});

test('v220 loads last in app chrome, stays out of print and ships offline',async()=>{
  const [html,sw,patch]=await Promise.all([read('index.html'),read('public/sw.js'),read('scripts/pwa-cache-v205.mjs')]);
  const layer=html.indexOf('./styles/dark-surface-continuity-v220.css');
  assert.ok(layer>html.indexOf('./styles/save-reliability-v217.css'));
  assert.ok(layer<html.indexOf('./styles/document-premium-redesign-v141.css'));
  assert.match(sw,/v220 dark surface continuity/);
  assert.match(sw,/LOCAL_CORE\.push\('\.\/styles\/dark-surface-continuity-v220\.css'\)/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v220'/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v219'.*legacy marker/);
});
