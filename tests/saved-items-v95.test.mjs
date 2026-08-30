import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v95 saved items layer remains loaded in source beneath later refinement layers',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const styles=[...html.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  const savedIndex=styles.indexOf('saved-items-v95.css');
  const v99Index=styles.indexOf('premium-smoothness-v99.css');
  const currentIndex=styles.indexOf('performance-polish-v100.css');
  assert.ok(savedIndex>=0);
  assert.ok(v99Index>savedIndex);
  assert.ok(currentIndex>v99Index);
  assert.match(sw,/lourex-invoice-v101/);
  assert.match(sw,/\.\/styles\/saved-items-v95\.css/);
  assert.match(sw,/\.\/styles\/premium-smoothness-v99\.css/);
  assert.match(sw,/\.\/styles\/performance-polish-v100\.css/);
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
