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

test('light party cards never inherit dark-template page ink',async()=>{
  const [appearance,css]=await Promise.all([
    read('src/lib/appearance.ts'),
    read('src/styles/template-surface-contrast-v366.css')
  ]);
  assert.match(appearance,/const surfaceInk='#17212b'/);
  assert.match(appearance,/const surface='#ffffff'/);
  assert.match(css,/\.invoice-page \.party-block/);
  assert.match(css,/--lrx-surface-ink/);
  assert.match(css,/\.party-name/);
  assert.match(css,/\.party-contact/);
});

test('dark template defaults and item table use explicit readable tokens',async()=>{
  const [appearance,renderer,css]=await Promise.all([
    read('src/lib/appearance.ts'),
    read('src/templates/TemplateRenderer.tsx'),
    read('src/styles/template-surface-contrast-v366.css')
  ]);
  for(const id of ['obsidian','noir','midnight','blackivory','carbon'])assert.match(appearance,new RegExp(id));
  assert.match(appearance,/defaultPrimary=dark\?'#f7f2e8':'#17212b'/);
  assert.match(renderer,/--lrx-table-header-ink/);
  assert.match(css,/\.items-table thead th/);
  assert.match(css,/font-size:max\(7\.4px,var\(--lrx-table-size,9\.1px\)\)/);
});
