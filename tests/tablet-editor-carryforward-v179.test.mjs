import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v179 restores a compact two-column full-width document header on tablets while phones remain single-column',async()=>{
  const [finalCss,workspaceCss]=await Promise.all([
    read('src/styles/final-mobile-accessibility-v168.css'),
    read('src/styles/editor-workspace-v162.css')
  ]);
  assert.match(finalCss,/@media \(min-width:721px\) and \(max-width:1180px\)/);
  assert.match(finalCss,/\.app-ui \.editor-pane \.editor-scroll>\*\{[\s\S]*width:100%!important;[\s\S]*max-width:none!important;[\s\S]*margin-inline:0!important/);
  assert.match(workspaceCss,/@media\(max-width:1180px\)[\s\S]*\.app-ui \.editor-scroll>\*\{max-width:840px!important\}/);
  assert.match(finalCss,/editor-section:first-child>\.form-grid\.two\.compact-grid\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(finalCss,/editor-section:first-child>\.form-grid\.two\.compact-grid>\.field:first-child\{[\s\S]*grid-column:1\/-1!important/);
  assert.match(workspaceCss,/@media\(max-width:900px\)[\s\S]*\.app-ui \.form-grid\.two\{grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(finalCss,/@media \(max-width:720px\)\{[\s\S]*final-quote-convert-bar\{order:45\}/);
});

test('v179 masks Safari native tablet date text behind the locale-safe Gregorian label',async()=>{
  const [core,finalCss,id]=await Promise.all([
    read('src/components/EditorPageCore.tsx'),
    read('src/styles/final-mobile-accessibility-v168.css'),
    read('src/lib/id.ts')
  ]);
  assert.match(core,/displayDate\(props\.value,getUiLanguage\(\)\)/);
  assert.match(id,/ar-SA-u-ca-gregory/);
  assert.match(id,/calendar:'gregory'/);
  assert.match(finalCss,/\.app-ui \.editor-date-value\{[\s\S]*display:block!important/);
  assert.match(finalCss,/\.app-ui \.editor-date-control input\[type='date'\]\{[\s\S]*opacity:\.001!important/);
});

test('v179 balances iPad steps and keeps the compact action dock touch-safe',async()=>{
  const css=await read('src/styles/final-mobile-accessibility-v168.css');
  const tablet=css.slice(css.indexOf('@media (min-width:721px) and (max-width:900px)'));
  assert.match(tablet,/\.app-ui \.editor-section-navigator\{[\s\S]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/);
  assert.match(tablet,/\.app-ui \.editor-section-nav-button\.active\{min-width:0!important\}/);
  assert.match(tablet,/\.app-ui \.editor-section-nav-button:not\(\.active\) \.editor-nav-label\{display:block!important\}/);
  assert.match(tablet,/\.app-ui \.mobile-editor-actionbar\{[\s\S]*min-height:calc\(56px \+ env\(safe-area-inset-bottom\)\)!important/);
  assert.match(tablet,/\.app-ui \.mobile-action-buttons \.btn\{[\s\S]*min-height:44px!important/);
  assert.match(tablet,/\.app-ui \.editor-pane \.editor-scroll\{[\s\S]*scroll-padding-bottom:28px!important/);
});

test('v179 ships through a fresh immutable PWA cache generation',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/^const CACHE = 'lourex-invoice-v179';$/m);
  assert.match(sw,/lourex-invoice-v176: preserved as a legacy marker/);
  assert.match(sw,/\.\/styles\/final-mobile-accessibility-v168\.css/);
  assert.match(sw,/SKIP_WAITING/);
  assert.doesNotMatch(sw,/^const CACHE = 'lourex-invoice-v176';$/m);
});
