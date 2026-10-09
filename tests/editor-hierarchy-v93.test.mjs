import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('approved editor hierarchy loads through current bundled owners',async()=>{
 const [html,distHtml,distSw]=await Promise.all([read('index.html'),read('dist/index.html'),read('dist/sw.js')]);
 assert.ok(html.includes('tailadmin-editor-frame-v320.css'));
 assert.ok(html.includes('tailadmin-editor-core-v320.css'));
 assert.equal(html.includes('editor-hierarchy-v93.css'),false);
 assert.ok(distHtml.includes('styles/app.bundle.css'));
 assert.ok(distSw.includes('styles/app.bundle.css'));
});

test('editor hierarchy refinement flattens nested controls without touching printable pages',async()=>{
  const css=await read('src/styles/editor-hierarchy-v93.css');
  assert.match(css,/premium-selected-customer[\s\S]*?border:\s*0\s*!important/);
  assert.match(css,/item-pricing-grid[\s\S]*?border:\s*0\s*!important/);
  assert.match(css,/adjustment-row[\s\S]*?border-radius:\s*0\s*!important/);
  assert.match(css,/editor-totals[\s\S]*?box-shadow:\s*none\s*!important/);
  assert.doesNotMatch(css,/\.document-page|\.invoice-page|\.a4[-_]/i);
});
