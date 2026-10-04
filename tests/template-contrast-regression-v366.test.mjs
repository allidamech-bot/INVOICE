import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v366 contrast guard is loaded after canonical premium output styles',async()=>{
  const html=await read('index.html');
  const premium=html.indexOf('document-premium-redesign-v141.css');
  const guard=html.indexOf('template-surface-contrast-v366.css');
  assert.ok(premium>=0&&guard>premium,'contrast guard must load after canonical premium A4 CSS');
});

test('v366 explicitly protects light quotation body copy from inverse text leakage',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/template-executive[\s\S]*template-ledger/);
  assert.match(css,/items-table tbody td[\s\S]*--lrx-light-ink/);
  assert.match(css,/-webkit-text-fill-color:var\(--lrx-light-ink\)!important/);
});

test('v366 keeps light cards readable inside dark commercial templates',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/\.invoice-page \.party-block[\s\S]*--lrx-light-ink/);
  assert.match(css,/template-obsidian[\s\S]*template-carbon[\s\S]*--lrx-dark-ink/);
});

test('v366 prevents microscopic item and party copy in preview and print',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/items-table tbody td\{font-size:max\(7\.4px,1em\)!important/);
  assert.match(css,/party-address[\s\S]*font-size:max\(7\.6px,1em\)!important/);
  assert.match(css,/@media print/);
});
