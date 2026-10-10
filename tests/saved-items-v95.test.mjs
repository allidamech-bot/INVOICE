import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('saved-item library is reachable in current product owner and offline release',async()=>{
 const [html,sw,current,saved]=await Promise.all([read('index.html'),read('dist/sw.js'),read('src/styles/tailadmin-products-v320.css'),read('src/components/SavedItemsModal.tsx')]);
 assert.equal(html.includes('saved-items-v95.css'),false,'retired presentation must not override active product UI');
 assert.ok(html.includes('tailadmin-products-v320.css'));
 assert.ok(current.includes('saved-items')||current.includes('ta-items'));
 assert.ok(saved.includes('saved-items-shell')&&saved.includes('saved-items-list'));
 assert.ok(sw.includes('styles/app.bundle.css'));
});

test('saved item component classes have a dedicated desktop library layout',async()=>{
  const [component,css]=await Promise.all([read('src/components/SavedItemsModal.tsx'),read('src/styles/saved-items-v95.css')]);
  for(const className of ['saved-items-shell','saved-items-list-pane','saved-items-toolbar','saved-items-list','saved-item-row','saved-item-main','saved-item-editor','saved-item-editor-actions']){
    assert.match(component,new RegExp(className));
    assert.match(css,new RegExp(`\\.${className}`));
  }
  assert.match(css,/saved-items-shell[\s\S]*?grid-template-columns:minmax\(300px/);
  assert.match(css,/saved-items-list[\s\S]*?overflow-y:auto/);
  assert.match(css,/saved-item-editor-actions[\s\S]*?position:sticky/);
});

test('saved item library becomes one-task-at-a-time on phones without touching printable invoices',async()=>{
  const css=await read('src/styles/saved-items-v95.css');
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/saved-item-editor:not\(\.is-open\)[\s\S]*?display:none/);
  assert.match(css,/saved-items-shell:has\(\.saved-item-editor\.is-open\) \.saved-items-list-pane[\s\S]*?display:none/);
  assert.match(css,/saved-item-editor \.form-grid\.two[\s\S]*?grid-template-columns:1fr\s*!important/);
  assert.doesNotMatch(css,/\.invoice-page|\.document-page|\.a4[-_]/i);
});
