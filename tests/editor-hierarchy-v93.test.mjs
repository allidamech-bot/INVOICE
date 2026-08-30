import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('editor hierarchy refinement remains loaded and ships offline in later releases',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  assert.match(html,/\.\/styles\/editor-hierarchy-v93\.css/);
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/\.\/styles\/editor-hierarchy-v93\.css/);
});

test('editor hierarchy refinement flattens nested controls without touching printable pages',async()=>{
  const css=await read('src/styles/editor-hierarchy-v93.css');
  assert.match(css,/premium-selected-customer[\s\S]*?border:\s*0\s*!important/);
  assert.match(css,/item-pricing-grid[\s\S]*?border:\s*0\s*!important/);
  assert.match(css,/adjustment-row[\s\S]*?border-radius:\s*0\s*!important/);
  assert.match(css,/editor-totals[\s\S]*?box-shadow:\s*none\s*!important/);
  assert.doesNotMatch(css,/\.document-page|\.invoice-page|\.a4[-_]/i);
});
