import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('Final quotation conversion is portaled into the editor layout instead of floating outside it',async()=>{
  const [wrapper,finalCss,editorCss,legacyCss]=await Promise.all([
    read('src/components/EditorPage.tsx'),
    read('src/styles/final-mobile-accessibility-v168.css'),
    read('src/styles/editor-workspace-v162.css'),
    read('src/styles/editor-workflow-v61.css')
  ]);

  // The legacy layer is intentionally left untouched for backward cascade safety;
  // the final release layer must override it structurally.
  assert.match(legacyCss,/\.final-quote-convert-bar\{position:fixed/);
  assert.match(wrapper,/document\.querySelector\('\.editor-screen'\)/);
  assert.match(wrapper,/ReactDOM\.createPortal\(finalQuoteAction,editorScreen\)/);
  assert.match(finalCss,/\.app-ui \.editor-screen>\.final-quote-convert-bar\{order:35\}/);
  assert.match(finalCss,/position:relative!important/);
  assert.match(finalCss,/bottom:auto!important/);
  assert.match(finalCss,/width:auto!important/);
  assert.match(finalCss,/\.app-ui \.editor-screen>\.editor-layout\{order:40\}/);
  assert.match(finalCss,/\.app-ui \.editor-screen>\.editor-section-nav-slot\{order:50\}/);
  assert.match(finalCss,/\.app-ui \.editor-screen>\.mobile-editor-actionbar\{order:60\}/);
  assert.match(editorCss,/\.app-ui \.editor-section-nav-slot\{[\s\S]*?min-height:46px!important/);
});

test('phone uses one flow stack while tablet and desktop keep conversion inline near the Final banner',async()=>{
  const css=await read('src/styles/final-mobile-accessibility-v168.css');

  assert.match(css,/@media \(max-width:900px\) and \(min-width:721px\)\{[\s\S]*?margin:8px 9px 0!important/);
  assert.match(css,/@media \(max-width:720px\)\{[\s\S]*?final-quote-convert-bar\{order:45\}/);
  assert.match(css,/@media \(max-width:720px\)\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto!important/);
  assert.match(css,/@media \(max-width:720px\)\{[\s\S]*?\.final-quote-convert-bar small\{display:none!important\}/);
  assert.match(css,/@media \(max-width:430px\)\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/mobile-preview-open>\.final-quote-convert-bar\{display:none!important\}/);
  assert.doesNotMatch(css,/--final-quote-actionbar-height|--final-quote-nav-height|bottom:calc\(var\(--final-quote/);
});

test('the conversion CTA keeps reliable touch geometry and the PWA still caches the final layout layer',async()=>{
  const [css,sw]=await Promise.all([
    read('src/styles/final-mobile-accessibility-v168.css'),
    read('public/sw.js')
  ]);
  assert.match(css,/\.final-quote-convert-bar>\.btn\{[\s\S]*?min-height:44px!important/);
  assert.match(sw,/\.\/styles\/final-mobile-accessibility-v168\.css/);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v173';$/m);
});
