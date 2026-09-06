import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v177 loads after all application mobile recovery layers, before document output, and ships in the active PWA cache',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const current='mobile-controls-density-v177.css';
  const doc='document-premium-redesign-v141.css';
  assert.ok(html.indexOf(current)>html.indexOf('mobile-overlap-recovery-v176.css'));
  assert.ok(html.indexOf(doc)>html.indexOf(current));
  const styles=[...html.matchAll(/<link rel="stylesheet" href="\.\/styles\/([^\"]+\.css)" \/>/g)].map(m=>m[1]);
  assert.equal(styles.at(-1),doc);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v177';$/m);
  assert.ok(sw.includes(`./styles/${current}`));
  assert.match(sw,/lourex-invoice-v176: preserved as a legacy marker/);
});

test('v177 establishes a universal 44px coarse-pointer interaction floor without touching document templates',async()=>{
  const css=await read('src/styles/mobile-controls-density-v177.css');
  assert.match(css,/@media \(max-width:960px\) and \(pointer:coarse\)/);
  assert.match(css,/\.app-ui :where\(button,\.btn,\.icon-btn,select,\.input\)/);
  assert.match(css,/\.auth-page :where\(button,\.btn,select,\.input\)/);
  assert.match(css,/min-height:44px!important/);
  assert.match(css,/button\[aria-label\][\s\S]*min-width:44px!important/);
  for(const selector of ['.documents-sort','.section-heading-actions .btn','.editor-top-left>.icon-btn','.mobile-action-buttons .btn','.settings-tabs>button','.product-library-row>.icon-btn','.cloud-account-actions .btn']) assert.ok(css.includes(selector),selector);
  assert.doesNotMatch(css,/\.invoice-page|\.template-|\.document-page|\.items-table/);
});

test('v177 keeps narrow headings, forms and tab lanes reachable instead of clipping them',async()=>{
  const css=await read('src/styles/mobile-controls-density-v177.css');
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/\.page-heading,[\s\S]*\.product-library-commandbar,[\s\S]*\.editor-topbar[\s\S]*min-width:0!important/);
  assert.match(css,/\.settings-tabs,[\s\S]*\.operations-tabs,[\s\S]*overflow-x:auto!important/);
  assert.match(css,/overflow-wrap:anywhere!important/);
  assert.match(css,/overscroll-behavior-inline:contain!important/);
  assert.match(css,/@media \(max-width:360px\)[\s\S]*flex-wrap:wrap!important/);
});
