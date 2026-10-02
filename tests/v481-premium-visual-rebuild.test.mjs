import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v481 is the final production presentation owner after all historical visual layers',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const build=String(pkg.scripts?.build||'');
  const finalizeIndex=build.indexOf('scripts/v347-startup-finalize.mjs');
  const v481Index=build.indexOf('scripts/v481-bundle-premium-visual.mjs');
  assert.ok(finalizeIndex>=0,'build lost startup finalize stage');
  assert.ok(v481Index>finalizeIndex,'v481 bundler must run after the historical/final runtime finalize stages');

  const bundle=await read('dist/styles/app.bundle.css');
  const markers=[
    '/* --- tailadmin-reliability-bridge-v320.css --- */',
    '/* --- premium-visual-system-v481.css --- */',
    '/* --- premium-workspaces-v481.css --- */',
    '/* --- premium-overlays-v481.css --- */',
    '/* --- premium-business-v481.css --- */'
  ];
  let previous=-1;
  for(const marker of markers){
    const index=bundle.indexOf(marker);
    assert.ok(index>previous,`built bundle owner order is invalid at ${marker}`);
    previous=index;
  }
  assert.doesNotMatch(bundle,/@import url\("\.\/premium-(?:visual-system|workspaces|overlays|business)-v481\.css/,'production must not depend on late v481 @imports');
});

test('v481 premium system provides one coherent dark/light mobile palette and command-center hierarchy',async()=>{
  const css=await read('src/styles/premium-visual-system-v481.css');
  assert.match(css,/--lx481-canvas:#040b14/,'dark canvas token is missing');
  assert.match(css,/html\[data-ui-theme="light"\][\s\S]*?--lx481-canvas:#f4f7fb/,'light canvas token is missing');
  assert.match(css,/--ft-accent:var\(--lx481-primary\)!important/,'legacy utility accent is not bridged into v481');
  assert.match(css,/\.ta-mobile-nav\{[\s\S]*?border-radius:28px!important/,'premium floating mobile dock contract is missing');
  assert.match(css,/\.ta-dashboard-header\{[\s\S]*?min-height:196px!important/,'compact command-center hero contract is missing');
  assert.match(css,/\.ta-kpi-card:nth-child\(2\).*?--lx481-tone:var\(--lx481-emerald\)/s,'semantic KPI differentiation is missing');
  assert.match(css,/\.ta-kpi-card:nth-child\(3\).*?--lx481-tone:var\(--lx481-violet\)/s,'semantic violet KPI differentiation is missing');
  assert.match(css,/\.ta-kpi-card:nth-child\(4\).*?--lx481-tone:var\(--lx481-rose\)/s,'semantic rose KPI differentiation is missing');
  assert.match(css,/\.ta-empty-state,.ta-chart-empty,.ta-dashboard-empty/,'intentional empty-state treatment is missing');
  assert.match(css,/min-height:44px/,'mobile touch-target floor is missing');
});

test('v481 workspace rebuild removes blank pipeline voids and gives documents/customers one premium hierarchy',async()=>{
  const css=await read('src/styles/premium-workspaces-v481.css');
  assert.match(css,/\.ta-documents-overview\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'documents overview is not a compact 2-column instrument grid');
  assert.match(css,/\.ta-doc-row\{[\s\S]*?border-radius:18px!important/,'document register cards lost the premium row contract');
  assert.match(css,/\.ta-customers-summary\{[\s\S]*?repeat\(3,minmax\(0,1fr\)\)/,'customer summary is not compact on mobile');
  assert.match(css,/\.lx-pipeline-board\{[\s\S]*?grid-template-columns:1fr!important/,'pipeline board must be a reachable mobile stage stack');
  assert.match(css,/\.lx-pipeline-column>\.lx-pipeline-empty\{[\s\S]*?min-height:76px!important/,'empty pipeline stages may regress into giant blank regions');
  assert.doesNotMatch(css,/\.lx-pipeline-column>\.lx-pipeline-empty\{[\s\S]{0,260}?min-height:\s*(?:[2-9]\d\d|\d{4,})px/i,'empty pipeline stages must stay compact');
});

test('v481 command surfaces rebuild More, Quick Create, Search and LOUREX AI as one design system',async()=>{
  const css=await read('src/styles/premium-overlays-v481.css');
  assert.match(css,/\.ta-mobile-sheet\{[\s\S]*?border-radius:26px!important/,'More sheet premium surface is missing');
  assert.match(css,/\.ta-sheet-group\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'More sheet must use the compact two-column command layout');
  assert.match(css,/\.ta-create-menu-grid\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'Quick Create command grid is missing');
  assert.match(css,/\.global-search-panel\{[\s\S]*?bottom:calc\(8px \+ env\(safe-area-inset-bottom,0px\)\)!important/,'Global Search safe-area contract is missing');
  assert.match(css,/\.lourex-ai-compose input\{[\s\S]*?font-size:16px!important/,'LOUREX AI composer must remain Safari-zoom safe');
  assert.match(css,/html\[data-ui-theme="light"\][\s\S]*?\.ta-mobile-sheet/,'Light mode overlay ownership is missing');
});

test('v481 business surfaces keep products finance reports settings account and recovery on the same palette',async()=>{
  const css=await read('src/styles/premium-business-v481.css');
  assert.match(css,/\.ta-products-overview,.ta-product-metrics,.ta-ops-metrics\)\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/,'business KPI grids lost compact mobile geometry');
  assert.match(css,/\.ta-report-filterbar\{padding:10px!important/,'reports filterbar premium contract is missing');
  assert.match(css,/\.ta-settings-shell\{[\s\S]*?background:var\(--lx481-canvas\)!important/,'settings shell can escape the v481 canvas');
  assert.match(css,/\.ta-settings-card\{[\s\S]*?background:linear-gradient\(155deg,var\(--lx481-surface-2\),var\(--lx481-surface\)\)!important/,'settings cards can regress to charcoal/brown legacy surfaces');
  assert.match(css,/\.app-recovery>section\{[\s\S]*?border-radius:22px!important/,'recovery premium surface contract is missing');
  assert.match(css,/html\[data-ui-theme="light"\] body \.app-recovery>section\{background:#fff!important/,'recovery Light mode surface contract is missing');
});
