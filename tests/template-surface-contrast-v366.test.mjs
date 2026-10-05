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

test('commercial document bodies remain light even for dark-identity templates',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  assert.match(appearance,/const page='#fffdf8'/);
  assert.match(appearance,/const defaultPrimary='#17212b'/);
  assert.match(appearance,/const defaultSecondary='#4d5b68'/);
  assert.doesNotMatch(appearance,/defaultPrimary=dark\?/);
});

test('light party cards use semantic guarded text roles',async()=>{
  const [appearance,css]=await Promise.all([
    read('src/lib/appearance.ts'),
    read('src/styles/template-surface-contrast-v366.css')
  ]);
  assert.match(appearance,/const surfaceInk='#17212b'/);
  assert.match(appearance,/const surface='#ffffff'/);
  assert.match(css,/\.invoice-page \.party-block\{color:var\(--lrx-primary/);
  assert.match(css,/\.party-name/);
  assert.match(css,/\.party-contact/);
  assert.match(css,/--lrx-secondary/);
});

test('dark local modules keep template-authored foreground contrast',async()=>{
  const [appearance,css]=await Promise.all([
    read('src/lib/appearance.ts'),
    read('src/styles/template-surface-contrast-v366.css')
  ]);
  assert.match(appearance,/const darkSurfaceInk='#fffaf0'/);
  assert.match(css,/Do not globally override table-header or totals text colors/);
  assert.doesNotMatch(css,/\.invoice-page \.items-table thead th,[^\n]*--lrx-table-header-ink/);
  assert.match(css,/font-size:max\(7\.4px,var\(--lrx-table-size,9\.1px\)\)/);
});
