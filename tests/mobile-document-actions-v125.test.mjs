import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v351 keeps the v125 path as a no-op compatibility stub only',async()=>{
  const css=await read('src/styles/mobile-document-actions-v125.css');
  assert.match(css,/retired compatibility stub/i);
  assert.doesNotMatch(css,/\.mobile-document-action-portal\s*\{/);
  assert.doesNotMatch(css,/z-index\s*:/i);
  assert.doesNotMatch(css,/pointer-events\s*:/i);
});

test('v351 DocumentsPage owns the only live mobile document action portal',async()=>{
  const page=await read('src/components/DocumentsPage.tsx');
  assert.match(page,/ReactDOM\.createPortal/);
  assert.match(page,/ta-doc-mobile-action-portal/);
  assert.match(page,/ta-doc-mobile-action-sheet/);
  assert.match(page,/ta-doc-action-backdrop/);
  assert.doesNotMatch(page,/mobile-document-action-portal/);
  assert.match(page,/private runAction=\(action:\(\)=>void\)=>this\.setState\(\{menuId:''\},action\)/);
});
