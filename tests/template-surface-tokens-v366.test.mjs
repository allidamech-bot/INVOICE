import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('appearance engine exposes independent surface and semantic ink tokens',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  assert.match(appearance,/surfaceInk:string/);
  assert.match(appearance,/surfaceMuted:string/);
  assert.match(appearance,/darkSurfaceInk:string/);
  assert.match(appearance,/darkSurfaceMuted:string/);
  assert.match(appearance,/heading:string;primary:string;secondary:string/);
  assert.match(appearance,/const surfaceInk='#17212b'/);
  assert.match(appearance,/const darkSurfaceInk='#fffaf0'/);
});

test('surface contrast is independent from overall template darkness',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  assert.match(appearance,/Surface tokens intentionally describe the actual component surface/);
  assert.match(appearance,/const surface='#ffffff'/);
  assert.match(appearance,/const darkSurface=dark\?'#202020':'#102b3d'/);
});

test('custom text colors pass contrast guards and unsafe choices fall back',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  assert.match(appearance,/function safeTextColor/);
  assert.match(appearance,/minContrast=4\.5/);
  assert.match(appearance,/appearance\.primaryTextColor/);
  assert.match(appearance,/appearance\.secondaryTextColor/);
  assert.match(appearance,/appearance\.headingTextColor/);
});

test('document typography remains bounded rather than free-form pixels',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  assert.match(appearance,/type TextScale='small'\|'normal'\|'large'/);
  assert.match(appearance,/documentTitleScale/);
  assert.match(appearance,/sectionHeadingScale/);
  assert.match(appearance,/bodyTextScale/);
  assert.match(appearance,/tableTextScale/);
});
