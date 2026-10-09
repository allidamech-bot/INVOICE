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

test('the current dark account and conflict surfaces are bundled offline without modifying print',async()=>{
  const [html,sourceSw,distSw,css,bundle]=await Promise.all([
    read('index.html'),read('public/sw.js'),read('dist/sw.js'),
    read('src/styles/tailadmin-cloud-account-v320.css'),read('dist/styles/app.bundle.css')
  ]);
  assert.match(html,/tailadmin-cloud-account-v320\.css/);
  assert.match(css,/@media screen/);
  assert.match(css,/\.ta-cloud-conflict/);
  assert.match(css,/\.ta-cloud-account/);
  assert.doesNotMatch(css,/\.invoice-page|@media print/,'account recovery must never change A4 rendering');
  assert.ok(sourceSw.includes('./styles/app.css'),'local/dev worker must preserve a stylesheet cache entry');
  assert.match(distSw,/\.\/styles\/app\.bundle\.css/);
  assert.match(bundle,/\.ta-cloud-conflict/);
});
