import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('template selector uses a lightweight document instead of rendering 18 full invoices',async()=>{
  const selector=await read('src/templates/TemplateThumbnails.tsx');
  assert.match(selector,/function thumbnailDocument\(doc:LourexDocument\):LourexDocument/);
  assert.match(selector,/doc\.items\.slice\(0,2\)/);
  assert.match(selector,/logoDataUrl:''/);
  assert.match(selector,/signatureDataUrl:''/);
  assert.match(selector,/stampDataUrl:''/);
  assert.match(selector,/showBank:false/);
  assert.match(selector,/showSignature:false/);
  assert.match(selector,/showStamp:false/);
  assert.match(selector,/const lightweightDoc=thumbnailDocument\(doc\)/);
  assert.match(selector,/TemplateRenderer document=\{preview\}/);
});

test('real document renderer remains untouched for full preview and print quality',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/paginateItems\(doc\.items/);
  assert.match(renderer,/LogoBlock document=\{doc\}/);
  assert.match(renderer,/Signature document=\{doc\}/);
});
