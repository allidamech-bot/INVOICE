import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v224 establishes one premium dark palette without touching document paper',async()=>{
  const css=await read('src/styles/luminous-noir-v224.css');
  assert.match(css,/@media screen/);
  assert.match(css,/--ds-accent:#5346D8/);
  assert.match(css,/linear-gradient\(135deg,#6958EA 0%,#456EDD 48%,#2F82C9 100%\)/);
  assert.match(css,/--ds-brass-highlight:#E2C27F/);
  assert.match(css,/\.auth-account-card \.google-auth-button\{/);
  assert.match(css,/\.app-ui :is\(\.cloud-conflict-banner,\.cloud-conflict-recovery\)/);
  assert.doesNotMatch(css,/\.invoice-page|\.invoice-pages|@media print/);
});

test('v224 gives shell, financial, overlay and mobile chrome explicit dark fallbacks',async()=>{
  const css=await read('src/styles/luminous-noir-v224.css');
  for(const selector of ['.workspace-shell','.workspace-sidebar','.workspace-topbar','.dashboard-kpis','.editor-totals .grand','.modal-backdrop','.mobile-bottom-nav','.mobile-more-sheet']){
    assert.ok(css.includes(selector),`${selector} must participate in Luminous Noir`);
  }
  assert.match(css,/\.app-ui \.issue-warning\.level-info\{background-color:#171D31!important/);
  assert.match(css,/\.app-ui \.issue-asset-checks>span\.ok\{background-color:#122B26!important/);
});

test('v224 loads after all legacy application layers and ships offline',async()=>{
  const [html,sw,patch,dist]=await Promise.all([read('index.html'),read('public/sw.js'),read('scripts/pwa-cache-v205.mjs'),read('dist/styles/app.bundle.css')]);
  const noir=html.indexOf('./styles/luminous-noir-v224.css');
  assert.ok(noir>html.indexOf('./styles/dark-surface-continuity-v220.css'));
  assert.ok(noir<html.indexOf('./styles/document-premium-redesign-v141.css'));
  assert.match(sw,/LOCAL_CORE\.push\('\.\/styles\/luminous-noir-v224\.css'\)/);
  assert.match(patch,/const CACHE = 'lourex-invoice-v224'/);
  assert.match(dist,/LOUREX Luminous Noir/);
});
