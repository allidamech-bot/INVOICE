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
  const bridge='/* --- tailadmin-reliability-bridge-v320.css --- */';
  const owner='/* --- premium-visual-system-v481.css --- */';
  const bridgeIndex=bundle.indexOf(bridge);
  const ownerIndex=bundle.indexOf(owner);
  assert.ok(bridgeIndex>=0,'built bundle lost the reliability bridge');
  assert.ok(ownerIndex>bridgeIndex,'v481 must be the final presentation owner after the reliability bridge');
  assert.doesNotMatch(bundle,/@import url\("\.\/premium-visual-system-v481\.css/,'production must not depend on a late v481 @import');
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
