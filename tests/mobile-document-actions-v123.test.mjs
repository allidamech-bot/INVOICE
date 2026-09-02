import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

// Covers the WebKit containing-block interaction that kept the v122 fixed sheet card-bound.
test('v123 removes WebKit card containment while the mobile action sheet is open',async()=>{
  const css=await read('src/styles/mobile-document-actions-v123.css');
  const html=await read('index.html');
  assert.match(css,/premium-document-card:has\(\.action-menu\)[\s\S]*?content-visibility:visible!important/);
  assert.match(css,/premium-document-card:has\(\.action-menu\)[\s\S]*?contain:none!important/);
  assert.match(css,/\.action-menu[\s\S]*?position:fixed!important/);
  assert.match(css,/bottom:max\([^)]*safe-area-inset-bottom/);
  assert.match(css,/left:12px!important[\s\S]*?right:12px!important/);
  assert.match(html,/mobile-document-actions-v123\.css/);
});
