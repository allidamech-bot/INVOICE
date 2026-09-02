import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v124 renders mobile document actions through document.body portal',async()=>{
  const source=await read('src/components/DocumentsPage.tsx');
  const css=await read('src/styles/mobile-document-actions-v124.css');
  const html=await read('index.html');
  const globals=await read('src/react-global.d.ts');

  assert.match(source,/ReactDOM\.createPortal\([\s\S]*?document\.body/);
  assert.match(source,/mobile-document-action-portal/);
  assert.match(source,/target\.closest\('\.mobile-actions,\.mobile-document-action-portal'\)/);
  assert.doesNotMatch(source,/mobile-actions[^\n]*\?\s*<div className="action-menu"/);
  assert.match(css,/\.mobile-document-action-portal[\s\S]*?position:fixed!important/);
  assert.match(css,/\.mobile-document-action-sheet[\s\S]*?left:12px!important[\s\S]*?right:12px!important/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(html,/mobile-document-actions-v124\.css/);
  assert.match(globals,/createPortal\(element: any, container: Element \| DocumentFragment\)/);
});
