import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v144 unifies the main application workspaces without adding a new production stylesheet',async()=>{
  const [css,html]=await Promise.all([read('src/styles/performance-polish-v100.css'),read('index.html')]);
  assert.match(css,/v144 — unified application UI\/UX refinement/);
  for(const selector of ['documents-overview','customer-card','saved-item-row','receivables-page','reports-page','operations-page','settings-tabs']){
    assert.ok(css.includes(selector),`v144 must cover ${selector}`);
  }
  assert.doesNotMatch(html,/system-ui-ux-v144\.css/);
  assert.equal((html.match(/performance-polish-v100\.css/g)||[]).length,1);
});

test('v144 remains app-only and protects responsive usability',async()=>{
  const css=await read('src/styles/performance-polish-v100.css');
  const v144=css.slice(css.indexOf('/* v144'));
  assert.match(v144,/\.app-ui \.main-content/);
  assert.match(v144,/@media \(max-width:720px\)/);
  assert.match(v144,/env\(safe-area-inset-bottom\)/);
  assert.match(v144,/settings-tabs\{position:sticky/);
  assert.match(v144,/@media \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(v144,/\.invoice-page|\.invoice-pages|\.document-sheet/);
});

test('v144 preserves financial scanning with tabular figures and compact tables',async()=>{
  const css=await read('src/styles/performance-polish-v100.css');
  const v144=css.slice(css.indexOf('/* v144'));
  assert.match(v144,/font-variant-numeric:tabular-nums/);
  assert.match(v144,/receivables-page table/);
  assert.match(v144,/reports-page table/);
  assert.match(v144,/operations-page table/);
  assert.match(v144,/tbody tr:hover/);
});
