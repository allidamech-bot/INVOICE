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

test('current TailAdmin owners form one ordered app bundle without retired precision-black cascade',async()=>{
 const [html,bundle]=await Promise.all([read('index.html'),read('dist/styles/app.bundle.css')]);
 const layers=['tailadmin-shell-v320.css','tailadmin-dashboard-v320.css','tailadmin-documents-v320.css','tailadmin-editor-frame-v320.css','tailadmin-editor-core-v320.css','tailadmin-reliability-bridge-v320.css'];
 for(const layer of layers)assert.ok(html.includes(layer)&&bundle.includes(layer),layer);
 assert.ok(html.indexOf(layers[1])>html.indexOf(layers[0]));
 assert.ok(html.indexOf(layers[3])>html.indexOf(layers[2]));
 for(const layer of layers.slice(0,-1))assert.equal(html.includes(layer.replace('tailadmin-','precision-black-')),false);
 assert.equal(html.includes('precision-black-final-v273.css'),false);
 assert.ok(html.includes('document-premium-redesign-v141.css'));
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
