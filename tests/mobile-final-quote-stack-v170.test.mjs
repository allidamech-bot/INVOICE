import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('Final quotation conversion reserves a dedicated mobile lane instead of covering the editor step dock',async()=>{
  const [finalCss,editorCss,legacyCss]=await Promise.all([
    read('src/styles/final-mobile-accessibility-v168.css'),
    read('src/styles/editor-workspace-v162.css'),
    read('src/styles/editor-workflow-v61.css')
  ]);

  assert.match(legacyCss,/\.final-quote-convert-bar\{position:fixed/);
  assert.match(editorCss,/\.app-ui \.editor-section-nav-slot\{[\s\S]*?min-height:48px!important/);
  assert.match(editorCss,/\.app-ui \.mobile-editor-actionbar\{[\s\S]*?z-index:34!important/);

  assert.match(finalCss,/body:has\(\.final-quote-convert-bar\)\{[\s\S]*?--final-quote-nav-height:48px/);
  assert.match(finalCss,/--final-quote-actionbar-height:64px/);
  assert.match(finalCss,/body:has\(\.final-quote-convert-bar\) \.app-ui \.editor-layout\{[\s\S]*?margin-bottom:var\(--final-quote-sheet-height\)!important/);
  assert.match(finalCss,/bottom:calc\(var\(--final-quote-nav-height\) \+ var\(--final-quote-actionbar-height\) \+ env\(safe-area-inset-bottom\) \+ 6px\)!important/);
  assert.match(finalCss,/z-index:33!important/);
});

test('narrow iPhone layout accounts for the two-row mobile action bar and hides conversion actions during full-screen preview',async()=>{
  const css=await read('src/styles/final-mobile-accessibility-v168.css');
  assert.match(css,/@media \(max-width:520px\)\{[\s\S]*?--final-quote-actionbar-height:86px/);
  assert.match(css,/@media \(max-width:430px\)\{[\s\S]*?--final-quote-sheet-height:106px/);
  assert.match(css,/body:has\(\.editor-screen\.mobile-preview-open\) \.final-quote-convert-bar\{display:none!important\}/);
});

test('the service worker refreshes the cached late mobile CSS after the overlap fix',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/mobile Final-quotation stack refresh/);
  assert.match(sw,/\.\/styles\/final-mobile-accessibility-v168\.css/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v169';$/m);
});
