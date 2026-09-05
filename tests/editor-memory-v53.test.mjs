import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('template selector uses zero-runtime decorative previews instead of invoice renderers',async()=>{
  const [selector,css]=await Promise.all([
    read('src/templates/TemplateThumbnails.tsx'),
    read('src/styles/template-preferences.css')
  ]);
  assert.match(selector,/function StaticTemplatePreview/);
  assert.match(selector,/template-mini-static/);
  assert.doesNotMatch(selector,/TemplateRenderer/);
  assert.doesNotMatch(selector,/thumbnailDocument/);
  assert.match(css,/zero-runtime template preview system/i);
  assert.match(css,/template-preview-executive/);
  assert.match(css,/template-preview-noir/);
  assert.match(css,/template-preview-carbon/);
});

test('hidden mobile overlay defers its full A4 render until opened',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/class DeferredMobilePreview/);
  assert.match(renderer,/MutationObserver/);
  assert.match(renderer,/mobile-preview-open/);
  assert.match(renderer,/scale===0\.48&&!props\.compact/);
  assert.match(renderer,/this\.state\.active\?renderDocument\(this\.props\)/);
});

test('real document renderer remains intact for full preview and print quality',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/const outputItems=doc\.items\.flatMap\(item=>outputItemFragments\(doc,item\)\)/);
  assert.match(renderer,/paginateItems\(outputItems, !separateDetails/);
  assert.match(renderer,/calculateTotals\(doc\.items, doc\.adjustments\)/);
  assert.match(renderer,/LogoBlock document=\{doc\}/);
  assert.match(renderer,/Signature document=\{doc\}/);
  assert.match(renderer,/return renderDocument\(props\)/);
});
