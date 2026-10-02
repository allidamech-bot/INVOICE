import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v482 runs after v481 and becomes the final mobile presentation owner',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=String(pkg.scripts?.build||'');
  const v481=build.indexOf('scripts/v481-bundle-premium-visual.mjs');
  const v482=build.indexOf('scripts/v482-bundle-mobile-ux-repair.mjs');
  assert.ok(v481>=0&&v482>v481,'v482 bundler must run after v481');

  const bundler=await read('scripts/v482-bundle-mobile-ux-repair.mjs');
  assert.match(bundler,/premium-regression-fixes-v481\.css/,'v482 must anchor after the final v481 owner');
  assert.match(bundler,/v482-mobile-ux-repair\.css/,'v482 CSS owner is not bundled');
});

test('v482 repairs the production mobile surfaces reported from iPhone screenshots',async()=>{
  const css=await read('src/styles/v482-mobile-ux-repair.css');
  assert.match(css,/\.ta-documents-header-actions\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/,'Documents command grid repair is missing');
  assert.match(css,/\.ta-create-menu-grid\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/,'Quick Create density repair is missing');
  assert.match(css,/\.lourex-ai-compose\{[\s\S]*?min-height:54px!important/,'AI composer geometry repair is missing');
  assert.match(css,/\.lourex-ai-panel\.is-open/,'full-screen AI mobile safe-area repair is missing');
  assert.match(css,/\.ta-sheet-link\{[\s\S]*?min-height:64px!important/,'More sheet command sizing repair is missing');
  assert.match(css,/html\[data-ui-theme="light"\][\s\S]*?background:#fff!important/,'Light mode clean surface repair is missing');
  assert.match(css,/min-height:44px!important/,'mobile touch-target floor is missing');
});
