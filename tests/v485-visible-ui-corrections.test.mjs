import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v485 centers the actual Documents type tiles instead of the hero action wrapper only',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/\.ta-doc-type-tabs\{[\s\S]*?-webkit-mask-image:none!important/,'document type tabs must remove the old edge mask');
  assert.match(css,/@media screen and \(max-width:900px\)[\s\S]*?\.ta-doc-type-tabs\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/,'mobile document tiles must become a centered two-column command grid');
  assert.match(css,/\.ta-doc-type-tabs>button\{[\s\S]*?justify-content:center!important[\s\S]*?text-align:center!important/,'document tile contents must be centered');
  assert.match(css,/\.ta-doc-type-tabs>button:last-child:nth-child\(odd\)[\s\S]*?justify-self:center!important/,'odd final tile must remain centered');
});

test('v485 gives Dark Mode visibly separated navy surfaces instead of stacked near-black layers',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/--lx485-canvas:#0a1826/);
  assert.match(css,/--lx485-surface:#12263a/);
  assert.match(css,/--lx485-surface-3:#1d3651/);
  assert.match(css,/--lx-ui-canvas:var\(--lx485-canvas\)/,
    'semantic canvas must use the final palette');
  assert.match(css,/--ft-surface:var\(--lx485-surface\)!important/,
    'legacy surface tokens must resolve to the visible final palette');
  assert.match(css,/:is\(\.modal,\.ta-mobile-sheet,\.ta-create-menu-mobile\)[\s\S]*?background:radial-gradient[\s\S]*?var\(--lx485-surface\)!important/,
    'More/Create overlays must use the navy surface as their opaque base');
  assert.match(css,/:is\(\.ta-sheet-link,\.ta-sheet-account,\.ta-sheet-theme,[\s\S]*?background:var\(--lx485-surface-3\)!important/,
    'More navigation and account cards must stand out from their overlay base');
});

test('v485 visibly activates the premium dashboard on iPad and desktop',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/@media screen and \(min-width:901px\)[\s\S]*?\.workspace-shell\.screen-home \.ta-finance-dashboard\{[\s\S]*?max-width:1440px!important/,
    'desktop dashboard must receive a bounded screen-home layout');
  assert.match(css,/\.workspace-shell\.screen-home \.ta-dashboard-header\{[\s\S]*?min-height:180px!important[\s\S]*?background:radial-gradient/,
    'desktop hero must retain measured height and a distinctive layered surface');
  assert.match(css,/\.workspace-shell\.screen-home \.ta-kpi-grid\{display:grid!important;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/,
    'full-width dashboard must show four readable KPI columns');
  assert.match(css,/@media screen and \(min-width:901px\) and \(max-width:1150px\)[\s\S]*?\.ta-kpi-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/,
    'iPad / narrow desktop KPI layout must adapt to two columns');
  assert.match(css,/:is\(\.ta-sidebar,\.ta-topbar\)\{[\s\S]*?background:var\(--lx485-canvas-2\)!important/,
    'desktop navigation must not fall back to a flat black background');
  assert.match(css,/:is\(\.lx-notification-center,\.lx-notification-summary,\.lourex-advisor-card,\.lourex-ai-panel,\.ai-customer-proposal,\.lx-inventory-planning\)\{[\s\S]*?background:var\(--lx485-surface\)!important/,
    'AI advisor and supporting dashboard cards must use the premium semantic surface');
});

test('v485 is the final production visual owner after v484',async()=>{
  const [pkg,bundle,standalone]=await Promise.all([
    read('package.json'),
    read('dist/styles/app.bundle.css'),
    read('dist/styles/v482-mobile-ux-repair.css')
  ]);
  assert.match(pkg,/v484-bundle-responsive-visual\.mjs && node scripts\/v485-bundle-visible-ui\.mjs/,'build must execute v485 after v484');
  const marker='/* --- v485-visible-ui-corrections.css --- */';
  const previous='/* --- v484-responsive-visual-hierarchy.css --- */';
  for(const [name,content] of [['bundle',bundle],['standalone',standalone]]){
    assert.ok(content.includes(marker),`${name} is missing v485 marker`);
    assert.ok(content.lastIndexOf(marker)>content.lastIndexOf(previous),`${name} does not place v485 after v484`);
  }
});

test('styles remain network-first in the PWA so this visual release is not hidden behind an old CSS cache',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/function isAppRuntimePath\(pathname\)[\s\S]*?pathname\.startsWith\('\/styles\/'\)/,'service worker must classify styles as app runtime paths');
  assert.match(sw,/isAppRuntimePath\(url\.pathname\)\)\{event\.respondWith\(networkFirst\(event\.request\)\)/,'app runtime paths must use network-first delivery');
});
