import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('legacy v123 card workaround stays retired while portal uses current safe-area sheet',async()=>{
 const [legacy,css,html]=await Promise.all([read('src/styles/mobile-document-actions-v123.css'),read('src/styles/tailadmin-documents-v320.css'),read('index.html')]);
 assert.match(legacy,/content-visibility:visible!important/);
 assert.match(legacy,/contain:none!important/);
 assert.doesNotMatch(html,/mobile-document-actions-v123\.css/);
 assert.match(html,/tailadmin-documents-v320\.css/);
 assert.match(css,/\.app-ui\.ta-doc-mobile-action-portal \{ position:fixed!important/);
 assert.match(css,/\.app-ui \.ta-doc-mobile-action-sheet \{ position:absolute!important/);
 assert.match(css,/bottom:calc\(8px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
 assert.doesNotMatch(css,/content-visibility:visible!important|contain:none!important/);
});
