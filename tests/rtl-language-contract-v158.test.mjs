import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v158 isolates document direction from application direction',async()=>{
  const [renderer,css]=await Promise.all([
    read('src/templates/TemplateRenderer.tsx'),
    read('src/styles/document-output-quality-v157.css')
  ]);
  assert.match(renderer,/dir=\{doc\.language==='ar'\?'rtl':'ltr'\}/);
  assert.match(css,/\.invoice-page\.lang-ar\{[\s\S]*direction:rtl!important;[\s\S]*text-align:right!important/);
  assert.match(css,/\.invoice-page\.lang-en,[\s\S]*\.invoice-page\.lang-bilingual\{[\s\S]*direction:ltr!important/);
});

test('v158 mirrors Arabic document structure exactly once',async()=>{
  const css=await read('src/styles/document-output-quality-v157.css');
  assert.match(css,/\.invoice-page\.lang-ar :is\([\s\S]*\.header-modern,[\s\S]*\.doc-meta,[\s\S]*\.party-grid,[\s\S]*\.items-table,[\s\S]*\.lower-grid,[\s\S]*\.bottom-grid,[\s\S]*\.doc-footer[\s\S]*\)\{direction:rtl!important\}/);
  assert.match(css,/\.invoice-page\.lang-bilingual :is\([\s\S]*\.party-grid[\s\S]*\)\{direction:ltr!important\}/);
});

test('v158 keeps Arabic prose RTL but technical identifiers LTR',async()=>{
  const css=await read('src/styles/document-output-quality-v157.css');
  assert.match(css,/\.meta-issue>span,.meta-due>span[\s\S]*unicode-bidi:plaintext!important/);
  assert.match(css,/\.meta-number>span,.meta-revision>span,.meta-source>span,[\s\S]*\.party-contact,[\s\S]*data-bank="iban"[\s\S]*data-bank="swift-\/-bic"[\s\S]*direction:ltr!important;[\s\S]*unicode-bidi:isolate!important/);
  assert.match(css,/\.items-table :is\(\.quantity-cell,.numeric-heading,.money-cell\)\{text-align:left!important\}/);
});

test('v158 gives bilingual English and Arabic fragments independent bidi isolation',async()=>{
  const css=await read('src/styles/document-output-quality-v157.css');
  assert.match(css,/\.invoice-page\.lang-bilingual :is\(\.bi-label,.bi-value\)>span:first-child\{[\s\S]*direction:ltr!important;[\s\S]*text-align:left!important/);
  assert.match(css,/\.invoice-page\.lang-bilingual :is\(\.bi-label,.bi-value\)>span:last-child\{[\s\S]*direction:rtl!important;[\s\S]*text-align:right!important;[\s\S]*letter-spacing:0!important/);
});
