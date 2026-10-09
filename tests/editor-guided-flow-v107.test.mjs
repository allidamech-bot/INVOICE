import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current editor retains accessible dynamic step navigation and error cues',async()=>{
 const editor=await read('src/components/EditorPage.tsx');
 for(const token of ['ta-editor-step-nav','ta-editor-step-list','node.dataset.editorStep=number','MutationObserver','section.scrollIntoView','section.hasError'])assert.ok(editor.includes(token),token);
 assert.match(editor,/aria-current=\{active\?'step':undefined\}/);
 assert.match(editor,/prefers-reduced-motion/);
 assert.ok(editor.includes('private syncActiveSection'));
 assert.ok(editor.includes('this.teardownSectionNavigation()'));
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

test('current editor guidance loads in the offline bundle with print owner preserved',async()=>{
 const [html,distHtml,distSw,frame]=await Promise.all([read('index.html'),read('dist/index.html'),read('dist/sw.js'),read('src/styles/tailadmin-editor-frame-v320.css')]);
 assert.equal(html.includes('editor-guided-flow-v107.css'),false);
 assert.ok(html.includes('tailadmin-editor-frame-v320.css'));
 assert.ok(html.includes('tailadmin-editor-core-v320.css'));
 assert.ok(frame.includes('.ta-editor-step-nav'));
 assert.ok(frame.includes('min-height:44px'));
 assert.ok(distHtml.includes('styles/app.bundle.css'));
 assert.ok(distSw.includes('styles/app.bundle.css'));
 assert.ok(html.includes('document-premium-redesign-v141.css'));
});
