import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('batch 7 defines one canonical application token vocabulary',async()=>{
  const css=await read('src/styles/design-system-v164.css');
  for(const token of [
    '--ds-navy-900','--ds-gold-500','--ds-ivory-100','--ds-surface','--ds-text',
    '--ds-muted','--ds-line','--ds-success','--ds-warning','--ds-danger',
    '--ds-space-1','--ds-space-7','--ds-radius-control','--ds-radius-card','--ds-focus'
  ])assert.ok(css.includes(token),`${token} must exist`);
  assert.match(css,/--shell-navy:var\(--ds-navy-900\)/);
  assert.match(css,/--ux-navy:var\(--ds-navy-900\)/);
  assert.match(css,/--editor-ink:var\(--ds-navy-900\)/);
});

test('batch 7 standardizes accessible controls, numbers and RTL without touching document output',async()=>{
  const css=await read('src/styles/design-system-v164.css');
  assert.match(css,/:focus-visible/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/font-variant-numeric:tabular-nums lining-nums/);
  assert.match(css,/html\[dir='rtl'\] \.app-ui/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/\.invoice-page\b/);
  assert.doesNotMatch(css,/\.items-table\b/);
});

test('batch 7 runtime loads the canonical design layer and retires obsolete action-sheet layers',async()=>{
  const html=await read('index.html');
  assert.match(html,/design-system-v164\.css/);
  assert.ok(html.indexOf('settings-account-v163.css')<html.indexOf('design-system-v164.css'));
  assert.ok(html.indexOf('design-system-v164.css')<html.indexOf('document-premium-redesign-v141.css'));
  for(const retired of ['mobile-document-actions-v122.css','mobile-document-actions-v123.css','mobile-document-actions-v124.css']){
    assert.equal(html.includes(retired),false,`${retired} must leave the runtime cascade`);
  }
  assert.match(html,/mobile-document-actions-v125\.css/);
});

test('the remaining mobile document action layer is self-contained',async()=>{
  const css=await read('src/styles/mobile-document-actions-v125.css');
  assert.match(css,/\.mobile-document-action-portal\{display:none\}/);
  assert.match(css,/@media \(max-width:900px\)/);
  assert.match(css,/\.mobile-document-action-backdrop/);
  assert.match(css,/\.mobile-document-action-sheet/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/html\[dir='rtl'\]/);
});
