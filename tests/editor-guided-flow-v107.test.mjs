import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v107 exposes a six-step editor navigator without changing editor data contracts',async()=>{
  const editor=await read('src/components/EditorPage.tsx');
  assert.match(editor,/editor-section-navigator/);
  assert.match(editor,/\.editor-pane \.editor-form-lock > \.editor-section/);
  assert.match(editor,/node\.dataset\.editorStep=number/);
  assert.match(editor,/MutationObserver/);
  assert.match(editor,/section\.scrollIntoView/);
  assert.match(editor,/aria-current=\{active\?'step':undefined\}/);
  assert.match(editor,/section\.hasError/);
  assert.match(editor,/prefers-reduced-motion/);
});

test('v107 keeps long mobile forms readable and the step dock touch-safe',async()=>{
  const css=await read('src/styles/editor-guided-flow-v107.css');
  assert.match(css,/v107 — guided editor flow/);
  assert.match(css,/\.editor-section-navigator\{/);
  assert.match(css,/position:fixed/);
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/\.editor-section-nav-button\.active \.editor-nav-label/);
  assert.match(css,/min-height:40px/);
  assert.match(css,/@media \(pointer:coarse\)/);
  assert.match(css,/@media print/);
  assert.doesNotMatch(css,/\.invoice-page\s*\{/);
  assert.doesNotMatch(css,/\.items-table\s*\{/);
});

test('v107 ships offline beneath the final canonical document layer',async()=>{
  const [index,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  assert.match(index,/editor-guided-flow-v107\.css/);
  assert.match(sw,/editor-guided-flow-v107\.css/);
  assert.match(sw,/v103/);
  assert.ok(index.indexOf('editor-guided-flow-v107.css')<index.indexOf('performance-polish-v100.css'));
  const styles=[...index.matchAll(/href="\.\/styles\/([^"]+\.css)"/g)].map(match=>match[1]);
  assert.equal(styles.at(-1),'document-premium-redesign-v141.css');
});
