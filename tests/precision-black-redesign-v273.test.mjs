import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const layers=[
  'precision-black-foundation-v267.css',
  'precision-black-shell-v268.css',
  'precision-black-dashboard-v269.css',
  'precision-black-directory-v270.css',
  'precision-black-finance-v271.css',
  'precision-black-editor-v272.css',
  'precision-black-final-v273.css'
];

test('Precision Black runtime layers are ordered and printable output remains final',async()=>{
  const html=await read('index.html');
  let cursor=html.indexOf('./styles/runtime-contrast-audit-v266.css');
  assert.ok(cursor>=0,'runtime audit layer missing');
  for(const layer of layers){
    const next=html.indexOf(`./styles/${layer}`);
    assert.ok(next>cursor,`${layer} must follow the preceding runtime layer`);
    cursor=next;
  }
  const printable=html.indexOf('./styles/document-premium-redesign-v141.css');
  assert.ok(printable>cursor,'printable document stylesheet must remain final');
  assert.equal((html.match(/precision-black-/g)||[]).length,layers.length);
});

test('Precision Black redesign does not introduce decorative gradients into its runtime layers',async()=>{
  for(const layer of layers){
    const css=await read(`src/styles/${layer}`);
    assert.doesNotMatch(css,/linear-gradient|radial-gradient/,`${layer} introduced a decorative gradient`);
  }
});

test('editor workbench and final bidi safeguards are explicit',async()=>{
  const [editor,finalCss]=await Promise.all([
    read('src/styles/precision-black-editor-v272.css'),
    read('src/styles/precision-black-final-v273.css')
  ]);
  assert.match(editor,/grid-template-columns:minmax\(560px,55%\) minmax\(0,45%\)!important/);
  assert.match(editor,/\.app-ui \.editor-section\s*\{/);
  assert.match(finalCss,/\.lourex-ai-launcher:dir\(rtl\)/);
  assert.match(finalCss,/left:max\(10px,env\(safe-area-inset-left\)\)!important/);
});
