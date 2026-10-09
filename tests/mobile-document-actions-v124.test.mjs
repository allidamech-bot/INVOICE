import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('current responsive document actions render body portal with Escape and backdrop dismissal',async()=>{
 const [source,css,html,globals]=await Promise.all([read('src/components/DocumentsPage.tsx'),read('src/styles/tailadmin-documents-v320.css'),read('index.html'),read('src/react-global.d.ts')]);
 assert.match(source,/ReactDOM\.createPortal\([\s\S]*?document\.body/);
 assert.ok(source.includes('ta-doc-mobile-action-portal'));
 assert.ok(source.includes("target.closest('.ta-doc-actions,.ta-doc-detail-more,.ta-doc-action-popover,.ta-doc-mobile-action-portal')"));
 assert.match(source,/event\.key==='Escape'/);
 assert.ok(source.includes('ta-doc-action-backdrop" aria-label='));
 assert.ok(source.includes("onClick={()=>this.setState({menuId:''})}"));
 assert.match(css,/\.app-ui\.ta-doc-mobile-action-portal \{ position:fixed!important/);
 assert.match(css,/\.app-ui \.ta-doc-mobile-action-sheet \{ position:absolute!important/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.doesNotMatch(html,/mobile-document-actions-v124\.css/);
 assert.match(html,/tailadmin-documents-v320\.css/);
 assert.match(globals,/createPortal\(element: any, container: Element \| DocumentFragment\)/);
});
