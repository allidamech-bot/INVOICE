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

test('v485 consumes the canonical theme instead of owning a second palette',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/--lx485-canvas:var\(--ft-canvas\)/);
  assert.match(css,/--lx485-surface:var\(--ft-surface\)/);
  assert.match(css,/--lx485-surface-3:var\(--ft-surface-3\)/);
  assert.match(css,/--lx485-blue:var\(--ft-accent\)/);
  assert.doesNotMatch(css,/--ft-(?:canvas|shell|workspace|surface(?:-2|-3)?|input|text(?:-strong|-soft)?|muted|faint|line(?:-strong)?|accent(?:-hover|-soft|-faint)?|on-accent|success(?:-soft)?|warning(?:-soft)?|danger(?:-soft)?|info(?:-soft)?|focus)\s*:/i);
  assert.match(css,/\.ta-documents-header-actions>:is\(button,\.btn\):not\(\.btn-primary\)[\s\S]*?background-color:var\(--ft-surface-3\)!important/,'non-primary create controls must use the canonical elevated surface');
  assert.match(css,/\.ta-mobile-sheet,\.ta-create-menu-mobile\)[\s\S]*?background:var\(--ft-surface\)!important/,'mobile sheets must use the canonical elevated surface hierarchy');
});

test('v485 keeps premium dashboard geometry without decorative palette layers',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/@media screen and \(min-width:901px\)[\s\S]*?\.ta-finance-dashboard/,'desktop dashboard owner is missing');
  assert.match(css,/workspace-shell\.screen-home \.ta-dashboard-header\{[\s\S]*?background:var\(--ft-surface-2\)!important/,'desktop hero must use the canonical raised surface');
  assert.match(css,/workspace-shell\.screen-home \.ta-kpi-card\{[\s\S]*?background:var\(--ft-surface\)!important/,'desktop KPI cards must use the canonical surface');
  assert.doesNotMatch(css,/#(?:c79347|c49a56|9b89df|8e91d5|9690df)/i,'legacy decorative gold/purple palette must not return');
});

test('v485 is the final production geometry owner after v484',async()=>{
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
