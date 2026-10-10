import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('approved screen-only editor layers replace legacy workflow geometry without A4 leakage',async()=>{
 const [html,frame,core,legacy]=await Promise.all([read('index.html'),read('src/styles/tailadmin-editor-frame-v320.css'),read('src/styles/tailadmin-editor-core-v320.css'),read('src/styles/editor-workflow-v61.css')]);
 assert.ok(html.indexOf('tailadmin-editor-frame-v320.css')>=0);
 assert.ok(html.indexOf('tailadmin-editor-core-v320.css')>html.indexOf('tailadmin-editor-frame-v320.css'));
 assert.equal(html.includes('editor-workflow-v61.css'),false,'retired layer cannot override canonical frame');
 assert.ok(frame.includes('.ta-editor-step-list'));
 assert.ok(core.includes('.app-ui'));
 for(const css of [frame,core,legacy])assert.doesNotMatch(css,/\.a4[-_]|\.document-page|\.invoice-page|@media\s+print/i);
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

test('v61 workflow layer remains cached across subsequent PWA releases',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/\.\/styles\/editor-workflow-v61\.css/);
});
