import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('logo auto-clean has a conservative second pass for dark residual background',async()=>{
  const source=await read('src/lib/files.ts');
  assert.match(source,/function applyLogoResidualShadowRemoval/);
  assert.match(source,/transparencyRatio\(data\) < \.08/);
  assert.match(source,/pixelSaturation\(red, green, blue\) < \.28/);
  assert.match(source,/saturation <= \.16 && luma <= 118/);
  assert.match(source,/fillRatio >= \.18 && aspect <= 4\.2/);
  assert.match(source,/Long\/thin dark typography is not treated as a background residue/);
  assert.match(source,/const residualChanged = applyLogoResidualShadowRemoval\(pixels\.data, width, height\)/);
  assert.match(source,/changed = residualChanged \|\| changed/);
});

test('current PWA release keeps the image-cleanup module available offline',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/\.\/src\/lib\/files\.js/);
});
