import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('mobile document actions load the viewport action-sheet layer',async()=>{
  const [html,css]=await Promise.all([
    read('index.html'),
    read('src/styles/mobile-document-actions-v122.css')
  ]);
  assert.match(html,/mobile-document-actions-v122\.css/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/\.premium-document-card \.action-menu\{[\s\S]*position:fixed!important/);
  assert.match(css,/inset-block-end:max\(12px,env\(safe-area-inset-bottom\)\)!important/);
  assert.match(css,/max-height:min\(70dvh,520px\)!important/);
  assert.match(css,/overflow-y:auto!important/);
});

test('mobile action sheet keeps card and list overflow visible',async()=>{
  const css=await read('src/styles/mobile-document-actions-v122.css');
  assert.match(css,/\.premium-document-list,[\s\S]*\.premium-document-card,[\s\S]*\.premium-document-card \.mobile-actions\{[\s\S]*overflow:visible!important/);
  assert.match(css,/\.premium-document-card:has\(\.action-menu\)\{[\s\S]*z-index:180!important/);
});
