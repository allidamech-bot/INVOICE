import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v61 editor workflow layer loads after the consolidated editor system and stays print-isolated',async()=>{
  const [html,css]=await Promise.all([read('index.html'),read('src/styles/editor-workflow-v61.css')]);
  assert.ok(html.indexOf('editor-workflow-v61.css')>html.indexOf('editor-system.css'));
  assert.match(css,/\.app-ui \.premium-item-card:focus-within/);
  assert.doesNotMatch(css,/\.a4[-_]|\.document-page|\.invoice-page|@media\s+print/i);
});

test('item creation controls remain reachable while scrolling long mobile and tablet documents',async()=>{
  const css=await read('src/styles/editor-workflow-v61.css');
  assert.match(css,/@media\(max-width:1180px\)/);
  assert.match(css,/\.editor-section:has\(\.add-item-button\)>\.section-heading\.with-action\{[^}]*position:sticky/);
  assert.match(css,/top:0/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/\.section-heading-actions \.btn\{[^}]*min-height:44px!important/);
});

test('active item and recent customer navigation are optimized for fast touch editing',async()=>{
  const css=await read('src/styles/editor-workflow-v61.css');
  assert.match(css,/premium-item-card:focus-within/);
  assert.match(css,/scroll-margin-top:150px/);
  assert.match(css,/recent-customer-row>div\{[^}]*scroll-snap-type:x proximity/);
  assert.match(css,/item-card-actions \.icon-btn,[^}]*min-width:40px/);
});

test('v61 PWA release caches the workflow layer for installed devices',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v61/);
  assert.match(sw,/\.\/styles\/editor-workflow-v61\.css/);
});
