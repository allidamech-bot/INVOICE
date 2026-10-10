import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('mobile document action portal uses current fixed viewport owner and safe-area limits',async()=>{
 const [html,css,sw]=await Promise.all([read('index.html'),read('src/styles/tailadmin-documents-v320.css'),read('public/sw.js')]);
 assert.doesNotMatch(html,/mobile-document-actions-v122\.css/);
 assert.match(html,/mobile-document-actions-v125\.css/);
 assert.match(html,/tailadmin-documents-v320\.css/);
 assert.match(css,/\.app-ui\.ta-doc-mobile-action-portal \{ position:fixed!important/);
 assert.match(css,/z-index:var\(--lourex-z-critical,1500\)!important/);
 assert.match(css,/\.app-ui \.ta-doc-mobile-action-sheet \{ position:absolute!important/);
 assert.match(css,/bottom:calc\(8px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
 assert.match(css,/max-height:min\(72dvh,620px\)!important/);
 assert.match(css,/overflow:auto!important/);
 assert.match(sw,/mobile-document-actions-v122\.css/);
});

test('action backdrop and menu are independently interactive, not clipped by document cards',async()=>{
 const [css,source]=await Promise.all([read('src/styles/tailadmin-documents-v320.css'),read('src/components/DocumentsPage.tsx')]);
 assert.match(css,/\.app-ui \.ta-doc-action-backdrop \{ position:absolute!important/);
 assert.match(css,/\.app-ui \.ta-doc-mobile-action-sheet>button \{ min-height:46px!important/);
 assert.doesNotMatch(css,/premium-document-card:has\(\.action-menu\)/);
 assert.ok(source.includes('ReactDOM.createPortal('));
 assert.ok(source.includes(',document.body)'));
 assert.ok(source.includes('ta-doc-action-backdrop" aria-label='));
});
