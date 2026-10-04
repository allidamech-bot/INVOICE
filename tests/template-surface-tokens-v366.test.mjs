import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('appearance engine exposes independent light and dark surface ink tokens',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  assert.match(appearance,/surfaceInk:string/);
  assert.match(appearance,/surfaceMuted:string/);
  assert.match(appearance,/darkSurfaceInk:string/);
  assert.match(appearance,/darkSurfaceMuted:string/);
  assert.match(appearance,/const surfaceInk='#17212b'/);
  assert.match(appearance,/const darkSurfaceInk='#fffaf0'/);
});

test('surface contrast is independent from overall template darkness',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  assert.match(appearance,/Surface tokens are intentionally independent/);
  assert.match(appearance,/const surface='#ffffff'/);
  assert.match(appearance,/const darkSurface=dark\?'#202020':'#102b3d'/);
});
