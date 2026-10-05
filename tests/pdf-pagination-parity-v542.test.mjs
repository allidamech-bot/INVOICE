import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('screen-time PDF source uses canonical A4 geometry before pagination',async()=>{
  const css=await read('src/styles/a4-mobile-print-v73.css');
  const screen=css.match(/@media screen\s*\{([\s\S]*?)\n\}/);
  assert.ok(screen,'screen-time print portal A4 contract missing');
  assert.match(screen[1],/#root \.print-portal \.invoice-pages/);
  assert.match(screen[1],/#root \.print-portal \.invoice-page/);
  assert.match(screen[1],/width:\s*210mm\s*!important/);
  assert.match(screen[1],/height:\s*297mm\s*!important/);
  assert.match(screen[1],/max-width:\s*none\s*!important/);
  assert.match(screen[1],/transform:\s*none\s*!important/);
});

test('iOS PDF bridge consumes only pagination-ready print portal pages',async()=>{
  const bridge=await read('public/ios-print-bridge.js');
  assert.match(bridge,/\.print-portal \[data-pagination-ready\]/);
  assert.match(bridge,/data-pagination-ready['"]\)===['"]true['"]/);
  assert.match(bridge,/querySelectorAll\(['"]\.print-portal \.invoice-page['"]\)/);
  assert.match(bridge,/const sourcePages = Array\.from/);
});

test('fixture renders the identical quotation snapshot into preview and PDF source',async()=>{
  const fixture=await read('tests/visual/v542-pagination-parity.js');
  assert.match(fixture,/mobile-preview-stage/);
  assert.match(fixture,/print-portal/);
  assert.match(fixture,/TemplateRenderer,\{document:documentData,scale:\.48/);
  assert.match(fixture,/TemplateRenderer,\{document:documentData,scale:1/);
  assert.match(fixture,/QUO-2026-0046/);
  assert.match(fixture,/Eti popkek 60 gr\*24/);
});
