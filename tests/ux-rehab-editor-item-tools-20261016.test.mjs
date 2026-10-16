import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('invoice items toolbar has one Add primary and an accessible keyboard disclosure',async()=>{
 const src=await read('src/components/EditorPageCore.tsx');
 const pos=src.indexOf('section-heading-actions editor-item-actions');
 assert.ok(pos>0,'the item toolbar must be present');
 const section=src.slice(pos,pos+2800);
 assert.match(section,/<Button icon="plus" className="add-item-button"/);
 assert.match(section,/<div className="editor-item-tools-menu"/);
 assert.match(section,/aria-expanded=\{this.state.itemToolsOpen\}/);
 assert.match(section,/Product tools/);
 assert.match(section,/<div className="editor-item-tools-options"/);
 assert.match(section,/role="group"/);
 assert.ok(section.indexOf('add-item-button')<section.indexOf('editor-item-tools-menu'),'Add should be the primary first action');
});

test('original saved products and AI review callbacks remain unchanged',async()=>{
 const src=await read('src/components/EditorPageCore.tsx');
 const section=src.slice(src.indexOf('section-heading-actions editor-item-actions'),src.indexOf('section-heading-actions editor-item-actions')+2800);
 assert.match(section,/onClick=\{\(\)=>this\.setState\(\{savedItemsOpen:true\}\)\}/);
 assert.match(section,/ContextualAdvisorAction screen="editor" disabled=\{this\.state\.issuing\}/);
 assert.match(section,/Suggest only; do not modify the document/);
 assert.match(section,/onClick=\{\(\)=>this\.mutate\(doc=>\(\{\.\.\.doc,items:\[\.\.\.doc\.items,emptyItem\(\)\]\}\)\)\}/);
 assert.match(src,/<SavedItemsModal open=\{this\.state\.savedItemsOpen\}/);
});

test('item tools dropdown is scoped, touch-sized and uses approved theme colors',async()=>{
 const css=await read('src/styles/editor-canonical-v314.css');
 const block=css.split('/* UX rehab A / item toolbar:')[1];
 assert.ok(block);
 assert.match(block,/\.section-heading-actions\.editor-item-actions\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(block,/\.editor-item-tools-menu>summary\{[\s\S]*?min-height:44px/);
 assert.match(block,/\.editor-item-tools-menu>summary:focus-visible/);
 assert.match(block,/\.editor-item-tools-options :is\(\.btn,button\)\{[\s\S]*?min-height:44px!important/);
 assert.doesNotMatch(block,/\.invoice-page|\.document-page|\.a4[-_]/i);
});
