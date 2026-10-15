import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load=path=>readFile(path,'utf8');

test('iPhone Add/Edit product owns the visible viewport and hides the mobile dock',async()=>{
  const css=await load('src/styles/v485-visible-ui-corrections.css');
  const fix=css.split('/* v605 — iPhone manual product Add/Edit sheet.')[1];
  assert.ok(fix,'final production visual owner must include the mobile product fix');
  assert.match(fix,/@media screen and \(max-width:900px\)/);
  assert.match(fix,/\.ta-shell:has\(\.ta-product-editor\.is-open\)>\.ta-mobile-nav\{[\s\S]*?visibility:hidden!important/);
  assert.match(fix,/\.ta-product-editor\.is-open\{[\s\S]*?position:fixed!important;[\s\S]*?max-height:none!important/);
  assert.match(fix,/\.ta-product-editor\.is-open>\.ta-product-editor-footer\{[\s\S]*?min-height:66px!important/);
});

test('product fields have an actual iOS pan-y scroll container even after older mobile fallbacks',async()=>{
  const css=await load('src/styles/v485-visible-ui-corrections.css');
  const fix=css.split('/* v605 — iPhone manual product Add/Edit sheet.')[1];
  assert.match(fix,/\.ta-product-editor\.is-open>\.ta-product-editor-scroll\{[\s\S]*?display:block!important;[\s\S]*?min-height:0!important;[\s\S]*?overflow-y:auto!important;[\s\S]*?touch-action:pan-y!important;[\s\S]*?-webkit-overflow-scrolling:touch!important/);
  assert.match(fix,/data-editor-viewport-constrained="true"[\s\S]*?top:var\(--lx-editor-viewport-top,8px\)!important;[\s\S]*?height:var\(--lx-editor-viewport-height/);
});

test('mobile product editor does not auto-focus inputs and force a Safari keyboard resize',async()=>{
  const source=await load('src/components/ProductLibraryWorkspace.tsx');
  assert.match(source,/const productAutoFocus=typeof window!=='undefined'&&typeof window\.matchMedia==='function'&&window\.matchMedia\('\(min-width:901px\)'\)\.matches/);
  assert.match(source,/autoFocus=\{productAutoFocus&&!isArabic\(\)\}/);
  assert.match(source,/autoFocus=\{productAutoFocus&&isArabic\(\)\}/);
});
