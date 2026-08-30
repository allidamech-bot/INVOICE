import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v94 workspace layer remains loaded and ships in later offline PWA shells',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  assert.match(html,/\.\/styles\/workspace-mobile-v94\.css/);
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/\.\/styles\/workspace-mobile-v94\.css/);
});

test('document overview responsive rules target the real button elements',async()=>{
  const closeout=await read('src/styles/workflow-closeout.css');
  assert.match(closeout,/documents-overview-five>button\.has-ready:before/);
  assert.match(closeout,/documents-overview-five>button\{min-width:100px\}/);
  assert.match(closeout,/documents-overview-five>button:first-child\{grid-column:1\/-1\}/);
  assert.doesNotMatch(closeout,/documents-overview-five>div/);
});

test('customer and settings mobile workspaces avoid overflow and vertical tab waste',async()=>{
  const css=await read('src/styles/workspace-mobile-v94.css');
  assert.match(css,/customers-page \.page-heading[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/customers-toolbar \.search-box[\s\S]*?width:100%\s*!important/);
  assert.match(css,/customer-info strong,[\s\S]*?text-overflow:ellipsis/);
  assert.match(css,/settings-tabs[\s\S]*?flex-direction:row\s*!important/);
  assert.match(css,/settings-tabs[\s\S]*?overflow-x:auto/);
  assert.match(css,/settings-title[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(css,/\.invoice-page|\.document-page|\.a4[-_]/i);
});
