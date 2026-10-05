import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v366 contrast guard loads after canonical premium document CSS',async()=>{
  const html=await read('index.html');
  const canonical=html.indexOf('./styles/document-premium-redesign-v141.css');
  const guard=html.indexOf('./styles/template-surface-contrast-v366.css');
  assert.ok(canonical>=0&&guard>canonical);
});

test('light party cards never inherit dark-template white ink',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page \.party-block/);
  assert.match(css,/--lrx-light-ink:#17212b/);
  assert.match(css,/\.party-name/);
  assert.match(css,/\.party-contact/);
});

test('hybrid dark-header templates keep light commercial body ink',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  for(const id of ['noir','midnight','blackivory','carbon']){
    assert.match(css,new RegExp(`template-${id}`),`hybrid template missing from light-sheet guard: ${id}`);
  }
  assert.match(css,/template-carbon\) :is\(\.items-table tbody[\s\S]*--lrx-light-ink/);
  assert.match(css,/template-carbon\) :is\(\.terms-block dt[\s\S]*--lrx-light-muted/);
});

test('midnight and carbon dark totals own inverse ink with legacy-proof specificity',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-pages>\.invoice-page:is\(\.template-midnight,\.template-carbon\) \.totals-block\{color:var\(--lrx-dark-ink\)!important;\}/);
  assert.match(css,/\.invoice-pages>\.invoice-page:is\(\.template-midnight,\.template-carbon\) \.totals-block :is\(\.total-row>span,\.total-row>strong,\.grand-total>span,\.grand-total>strong,small\)\{color:var\(--lrx-dark-ink\)!important;-webkit-text-fill-color:var\(--lrx-dark-ink\)!important;\}/);
});

test('obsidian alone retains explicit dark-body ink',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.template-obsidian :is\(\.items-table tbody[\s\S]*--lrx-dark-ink/);
  assert.doesNotMatch(css,/\.template-(?:noir|midnight|blackivory|carbon) :is\(\.items-table tbody[\s\S]*--lrx-dark-ink/);
  assert.match(css,/\.items-table thead th/);
  assert.match(css,/items-table tbody td\{font-size:max\(calc\(7\.4px \* var\(--doc-text-scale,1\)\)/);
  assert.match(css,/calc\(1em \* var\(--doc-text-scale,1\)\)/);
});
