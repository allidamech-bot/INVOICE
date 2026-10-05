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

test('commercial document bodies use real light template papers even for dark identities',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  assert.match(appearance,/TEMPLATE_PAPERS/);
  assert.match(appearance,/obsidian:'#ffffff'/);
  assert.match(appearance,/noir:'#fffdf8'/);
  assert.match(appearance,/midnight:'#fcfaf4'/);
  assert.match(appearance,/blackivory:'#fbf6eb'/);
  assert.match(appearance,/carbon:'#fafafa'/);
  assert.match(appearance,/const defaultPrimary='#17212b'/);
  assert.match(appearance,/const defaultSecondary='#4d5b68'/);
});

test('custom light-body roles are semantic and contrast guarded',async()=>{
  const [appearance,css]=await Promise.all([read('src/lib/appearance.ts'),read('src/styles/template-surface-contrast-v366.css')]);
  assert.match(appearance,/safeTextColor/);
  assert.match(appearance,/const surfaceInk='#17212b'/);
  assert.match(css,/\.invoice-page\.palette-custom \.party-block\{color:var\(--lrx-primary/);
  assert.match(css,/\.party-name/);
  assert.match(css,/\.party-contact/);
  assert.match(css,/--lrx-secondary/);
});

test('Auto and dark local modules keep canonical authored foreground contrast',async()=>{
  const css=await read('src/styles/template-surface-contrast-v366.css');
  assert.match(css,/Auto means matched to the selected template/);
  assert.match(css,/Deliberately absent: custom foreground rules/);
  assert.doesNotMatch(css,/\.invoice-page\.palette-auto\s/);
  assert.doesNotMatch(css,/\.invoice-page\.palette-custom \.items-table thead th[^\n]*--lrx/);
  assert.doesNotMatch(css,/\.invoice-page\.palette-custom \.totals-block[^\n]*color:var\(--lrx/);
  assert.match(css,/font-size:max\(7\.4px,var\(--lrx-table-size,9\.1px\)\)/);
});
