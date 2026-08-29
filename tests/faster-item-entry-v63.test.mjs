import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('similar-item action is surfaced from the existing explicit duplicate control',async()=>{
  const [editor,css]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/styles/editor-workflow-v61.css')
  ]);
  assert.match(editor,/private duplicateItem=\(item:DocumentItem\)/);
  assert.match(editor,/label=\{t\('Duplicate item','نسخ الصنف'\)\}/);
  assert.match(css,/save-item-library-button\+\.icon-btn::after/);
  assert.match(css,/content:'Similar'/);
  assert.match(css,/content:'صنف مشابه'/);
});

test('v63 does not make blank Add Item silently inherit price or description',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  assert.match(editor,/add-item-button[^>]*onClick=\{\(\)=>this\.mutate\(doc=>\(\{\.\.\.doc,items:\[\.\.\.doc\.items,emptyItem\(\)\]\}\)\)\}/);
  assert.doesNotMatch(editor,/add-item-button[\s\S]{0,260}duplicateItem/);
});

test('similar-item action stays touch friendly and degrades to icon-only on very narrow screens',async()=>{
  const css=await read('src/styles/editor-workflow-v61.css');
  assert.match(css,/@media\(max-width:720px\)[\s\S]*save-item-library-button\+\.icon-btn\{[^}]*min-height:44px/);
  assert.match(css,/@media\(max-width:430px\)[\s\S]*min-width:104px/);
  assert.match(css,/@media\(max-width:350px\)[\s\S]*::after\{[^}]*display:none/);
});

test('v63 remains isolated from printable A4 internals and ships through the PWA cache',async()=>{
  const [css,sw]=await Promise.all([
    read('src/styles/editor-workflow-v61.css'),
    read('public/sw.js')
  ]);
  assert.doesNotMatch(css,/\.a4[-_]|\.document-page|\.invoice-page|@media\s+print/i);
  assert.match(sw,/lourex-invoice-v63/);
  assert.ok(sw.includes('./styles/editor-workflow-v61.css'));
});
