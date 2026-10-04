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

test('dark template body and table surfaces retain explicit readable ink',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  for(const id of ['obsidian','noir','midnight','blackivory','carbon'])assert.match(css,new RegExp(`template-${id}`));
  assert.match(css,/--lrx-dark-ink:#fffaf0/);
  assert.match(css,/\.items-table thead th/);
  assert.match(css,/font-size:max\(7\.4px,1em\)/);
});
