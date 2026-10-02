import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v484 removes pure-black stacking with explicit dark surface hierarchy',async()=>{
  const css=await read('src/styles/v484-responsive-visual-hierarchy.css');
  assert.match(css,/--lx484-canvas:#07111c/);
  assert.match(css,/--lx484-surface:#0f1d2d/);
  assert.match(css,/--lx484-surface-2:#13243a/);
  assert.match(css,/--lx484-surface-3:#182b43/);
  assert.match(css,/\.ta-mobile-sheet[\s\S]*?background-color:var\(--lx484-surface\)!important/);
  assert.match(css,/\.ta-mobile-sheet :is\(\.ta-sheet-account,\.ta-sheet-link[\s\S]*?background-color:var\(--lx484-surface-3\)!important/);
});

test('v484 centers Documents actions and activates premium styling on iPad and desktop',async()=>{
  const css=await read('src/styles/v484-responsive-visual-hierarchy.css');
  assert.match(css,/\.ta-documents-header-actions\{[\s\S]*?margin-inline:auto!important[\s\S]*?justify-self:center!important/);
  assert.match(css,/@media screen and \(min-width:901px\)[\s\S]*?\.ta-documents-header\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) minmax\(360px,480px\)!important/);
  assert.match(css,/@media screen and \(min-width:901px\)[\s\S]*?\.ta-main\{padding:24px 28px 34px!important/);
  assert.match(css,/@media screen and \(min-width:901px\) and \(max-width:1120px\)/);
});

test('v484 is the final production visual owner after v483',async()=>{
  const [pkg,bundler]=await Promise.all([
    read('package.json'),
    read('scripts/v484-bundle-responsive-visual.mjs')
  ]);
  const scripts=JSON.parse(pkg).scripts;
  assert.match(scripts.build,/v483-bundle-mobile-density\.mjs && node scripts\/v484-bundle-responsive-visual\.mjs$/);
  assert.match(bundler,/v484-responsive-visual-hierarchy\.css/);
  assert.match(bundler,/v484Index<=v483Index/);
  assert.match(bundler,/standalonePath='dist\/styles\/v482-mobile-ux-repair\.css'/);
});
