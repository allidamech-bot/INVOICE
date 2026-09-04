import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('historical v122 action-sheet layer is retired from runtime in favor of the consolidated portal',async()=>{
  const [html,current,sw]=await Promise.all([
    read('index.html'),
    read('src/styles/mobile-document-actions-v125.css'),
    read('public/sw.js')
  ]);
  assert.doesNotMatch(html,/mobile-document-actions-v122\.css/);
  assert.match(html,/mobile-document-actions-v125\.css/);
  assert.match(current,/@media \(max-width:900px\)/);
  assert.match(current,/\.mobile-document-action-portal[\s\S]*?position:fixed!important/);
  assert.match(current,/bottom:max\(12px,env\(safe-area-inset-bottom\)\)!important/);
  assert.match(current,/max-height:min\(72dvh,560px\)!important/);
  assert.match(current,/overflow-y:auto!important/);
  // Source-cache compatibility can keep the old file during the migration; it
  // must not participate in the live cascade anymore.
  assert.match(sw,/mobile-document-actions-v122\.css/);
});

test('the consolidated body portal no longer depends on card overflow escape hatches',async()=>{
  const current=await read('src/styles/mobile-document-actions-v125.css');
  assert.match(current,/\.mobile-document-action-portal \.mobile-document-action-backdrop/);
  assert.match(current,/pointer-events:none!important/);
  assert.match(current,/pointer-events:auto!important/);
  assert.doesNotMatch(current,/premium-document-card:has\(\.action-menu\)/);
});
