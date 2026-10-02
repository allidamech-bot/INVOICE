import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v482 runs after v481 and owns the real production cascade after v332',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=String(pkg.scripts?.build||'');
  const v481=build.indexOf('scripts/v481-bundle-premium-visual.mjs');
  const v482=build.indexOf('scripts/v482-bundle-mobile-ux-repair.mjs');
  assert.ok(v481>=0&&v482>v481,'v482 bundler must run after v481');

  const [bundler,finalize,sourceCss,emittedCss]=await Promise.all([
    read('scripts/v482-bundle-mobile-ux-repair.mjs'),
    read('scripts/v347-startup-finalize.mjs'),
    read('src/styles/v482-mobile-ux-repair.css'),
    read('dist/styles/v482-mobile-ux-repair.css')
  ]);
  assert.match(bundler,/premium-regression-fixes-v481\.css/,'v482 must anchor after the final v481 bundle owner');
  assert.match(bundler,/standalonePath='dist\/styles\/v482-mobile-ux-repair\.css'/,'v482 build does not emit the standalone stylesheet referenced by production');
  assert.equal(emittedCss.trim(),sourceCss.trim(),'emitted standalone v482 stylesheet differs from its source owner');
  assert.match(finalize,/v482MobileRepair='\.\/styles\/v482-mobile-ux-repair\.css\?v=482'/,'production standalone v482 stylesheet is not wired');
  assert.match(finalize,/app\.bundle\.css -> v331 -> v332 -> v482/,'production final owner order contract is missing');
  assert.match(finalize,/data-lourex-v482-mobile-ux="true"/,'production v482 owner marker is missing');
  assert.match(finalize,/criticalDocumentsRuntime,v482MobileRepair/,'v482 stylesheet is not included in final service-worker precache verification');
});

test('v482 TailAdmin QA mirrors the production owner cascade and checks AI overlap',async()=>{
  const runner=await read('tests/visual/run-tailadmin-v320.cjs');
  assert.match(runner,/productionVisualOwners=\[[\s\S]*?name:'v331'[\s\S]*?name:'v332'[\s\S]*?name:'v482'/,'TailAdmin QA does not mirror v331 -> v332 -> v482');
  assert.match(runner,/applyProductionVisualOwners\(page\)/,'TailAdmin QA never applies the production owner cascade');
  assert.match(runner,/qaOwnerOrder\.join\(','\)!=='v331,v332,v482'/,'TailAdmin QA does not enforce owner order');
  assert.match(runner,/titleActionsOverlap/,'TailAdmin QA does not guard LOUREX AI header overlap');
});

test('v482 repairs the production mobile surfaces reported from iPhone screenshots',async()=>{
  const css=await read('src/styles/v482-mobile-ux-repair.css');
  assert.match(css,/\.ta-documents-header-actions\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/,'Documents command grid repair is missing');
  assert.match(css,/\.ta-create-menu-grid\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/,'Create menu density repair is missing');
  assert.match(css,/\.global-search-actions\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/,'Global Search quick-create density repair is missing');
  assert.match(css,/\.lourex-ai-compose\{[\s\S]*?min-height:54px!important/,'AI composer geometry repair is missing');
  assert.match(css,/#lourex-ai-panel\.lourex-ai-panel\{[\s\S]*?inset:max\(8px,env\(safe-area-inset-top,0px\)\)/,'full-screen AI mobile safe-area repair is missing');
  assert.match(css,/#lourex-ai-panel \.lourex-ai-head\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto!important/,'AI header overlap repair is missing');
  assert.match(css,/#lourex-ai-panel \.lourex-ai-close\{[\s\S]*?position:static!important/,'AI close control must remain in header flow');
  assert.match(css,/\.ta-sheet-link\{[\s\S]*?min-height:62px!important/,'More sheet command sizing repair is missing');
  assert.match(css,/\.ta-business-health-card/,'Business Health production card repair is missing');
  assert.match(css,/\.ta-range-control/,'Dashboard analytics control repair is missing');
  assert.match(css,/html\[data-ui-theme="light"\][\s\S]*?background:#fff!important/,'Light mode clean surface repair is missing');
  assert.match(css,/min-height:44px!important/,'mobile touch-target floor is missing');
});
