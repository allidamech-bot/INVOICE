import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('document design controls use flat LOUREX settings rows instead of nested cards',async()=>{
  const controls=await read('src/components/DocumentDesignControls.tsx');
  assert.match(controls,/document-design-group/);
  assert.match(controls,/document-design-row/);
  assert.match(controls,/document-design-control/);
  assert.match(controls,/document-color-control/);
  assert.match(controls,/document-color-swatch/);
  assert.doesNotMatch(controls,/design-control-card/);
  assert.doesNotMatch(controls,/appearance-system-grid/);
  assert.doesNotMatch(controls,/<Field\b/);
  assert.doesNotMatch(controls,/<Input\b/);
});

test('custom colors keep the agreed semantic roles and a compact native color picker',async()=>{
  const controls=await read('src/components/DocumentDesignControls.tsx');
  for(const key of ['accentColor','headingTextColor','primaryTextColor','secondaryTextColor'])assert.match(controls,new RegExp(key));
  assert.match(controls,/type="color"/);
  assert.match(controls,/document-color-value/);
  assert.match(controls,/Readability guard is always on/);
  assert.match(controls,/does not recolor dark mastheads or totals text/);
});

test('late editor CSS removes nested design surfaces and keeps mobile controls touch safe',async()=>{
  const css=await read('src/styles/roadmap-hardening-final.css');
  assert.match(css,/LOUREX v540/);
  assert.match(css,/\.screen-editor \.design-advanced-panel\{[\s\S]*padding:0!important;[\s\S]*background:transparent!important;/);
  assert.match(css,/\.screen-editor \.document-design-group\{[\s\S]*border:0!important;[\s\S]*background:transparent!important;/);
  assert.match(css,/\.screen-editor \.document-design-row\{[\s\S]*grid-template-columns:/);
  assert.match(css,/\.screen-editor \.document-color-control\{[\s\S]*min-height:44px!important;/);
  assert.match(css,/\.screen-editor \.document-color-swatch\{[\s\S]*width:36px!important;/);
  assert.match(css,/\.screen-editor \.watermark-editor-card,[\s\S]*\.watermark-editor-body\{[\s\S]*background:transparent!important;/);
  assert.match(css,/\.watermark-preset-row\{[\s\S]*flex-wrap:nowrap!important;[\s\S]*overflow-x:auto!important;/);
  assert.match(css,/@media screen and \(max-width:900px\)\{[\s\S]*\.watermark-editor-body \.form-grid\.two\.compact-grid\{[\s\S]*grid-template-columns:1fr!important;/);
});

test('RTL remains logical-flow based rather than manually reversing controls',async()=>{
  const css=await read('src/styles/roadmap-hardening-final.css');
  assert.match(css,/html\[dir="rtl"\][\s\S]*document-design-group-head[\s\S]*text-align:right!important/);
  assert.doesNotMatch(css,/document-design-row[^}]*flex-direction:row-reverse/);
});
