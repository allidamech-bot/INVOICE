import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v366 keeps the Draft template chooser at the end of the editing flow',async()=>{
  const css=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(css,/\.draft-studio-scroll\{[\s\S]*?display:grid!important;[\s\S]*?grid-auto-flow:row!important;/);
  assert.match(css,/\.draft-pdf-design-section\{[\s\S]*?order:99!important;/);
  assert.match(css,/@media screen and \(max-width:900px\)[\s\S]*?\.draft-studio-scroll\{[\s\S]*?display:flex!important;[\s\S]*?flex-direction:column!important;[\s\S]*?\.draft-pdf-design-section\{[\s\S]*?order:99!important;/);
  assert.match(css,/\.draft-pdf-design-section \.draft-section-heading>span::after\{[\s\S]*?content:"04";/);
});

test('v366 compacts Draft template cards for phone editing',async()=>{
  const css=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(css,/\.draft-pdf-design-section \.template-card\{[\s\S]*?border-radius:14px!important;/);
  assert.match(css,/\.draft-pdf-design-section \.template-mini\{[\s\S]*?height:112px!important;/);
  assert.match(css,/@media screen and \(max-width:900px\)[\s\S]*?\.draft-pdf-design-section \.template-selector\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;/);
  assert.match(css,/@media screen and \(max-width:390px\)[\s\S]*?\.draft-pdf-design-section \.template-mini\{[\s\S]*?height:94px!important;/);
});

test('v366 lifts the Draft command dock into the Safari dynamic viewport and preserves content clearance',async()=>{
  const css=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(css,/padding-bottom:calc\(148px \+ env\(safe-area-inset-bottom,0px\)\)!important;/);
  assert.match(css,/scroll-padding-bottom:calc\(154px \+ env\(safe-area-inset-bottom,0px\)\)!important;/);
  assert.match(css,/\.draft-studio\.editor-screen>\.draft-mobile-actionbar\{[\s\S]*?position:fixed!important;[\s\S]*?z-index:260!important;/);
  assert.match(css,/calc\(100vh - 100dvh \+ 8px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(css,/visibility:visible!important;[\s\S]*?opacity:1!important;[\s\S]*?pointer-events:auto!important;/);
  assert.match(css,/\.draft-studio\.editor-screen>\.draft-mobile-actionbar>\.btn\{[\s\S]*?display:inline-flex!important;[\s\S]*?min-height:50px!important;/);
});

test('v366 stabilizes bilingual Draft title rendering without touching auth or PIN surfaces',async()=>{
  const css=await read('src/styles/v331-draft-scroll-recovery.css');
  assert.match(css,/\.draft-letter-page\.lang-bilingual \.draft-document-purpose strong\{[\s\S]*?direction:ltr!important;[\s\S]*?unicode-bidi:plaintext!important;[\s\S]*?font-family:Cairo,Tajawal/);
  const v366=css.slice(css.indexOf('/* LOUREX v366'));
  assert.doesNotMatch(v366,/\.ta-auth(?:-|\b)|\.unlock-screen\b|\.pin-recovery\b|\.pin-migration\b/);
});
