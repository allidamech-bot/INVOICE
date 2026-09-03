import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('historical contrast and art-direction layers no longer participate in runtime',async()=>{
  const html=await read('index.html');
  assert.equal(html.indexOf('document-art-direction-v120.css'),-1);
  assert.equal(html.indexOf('document-palette-v121.css'),-1);
  assert.ok(html.indexOf('document-premium-redesign-v141.css')>=0);
});

test('document renderer exposes computed accent ink for dynamic contrast',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/--accent-ink/);
  assert.match(renderer,/resolvedAccentInk\(accent\)/);
});

test('v121 uses calculated accent ink where copy sits directly on accent',async()=>{
  const css=await read('src/styles/document-palette-v121.css');
  assert.match(css,/template-split[\s\S]*var\(--accent-ink\)/);
  assert.match(css,/money-cell\.strong[\s\S]*contrast-ink/);
  assert.match(css,/grand-total[\s\S]*contrast-navy/);
});

test('automatic template palette avoids purple accent defaults',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  assert.doesNotMatch(appearance,/#7259b8|#6b5bb4|#6f64ce/i);
  assert.match(appearance,/aurora:'#b58b4f'/);
  assert.match(appearance,/prism:'#3f736f'/);
});

test('aurora masthead is fixed navy and no longer mixes purple into its background',async()=>{
  const css=await read('src/styles/document-palette-v121.css');
  const start=css.indexOf('.template-aurora .header-modern');
  const block=css.slice(start,start+260);
  assert.match(block,/#0a2638/);
  assert.doesNotMatch(block,/6f64ce|6b5bb4/i);
});
