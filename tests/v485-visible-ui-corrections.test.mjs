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
  assert.match(css,/\.ta-documents-header-actions>:is\(button,\.btn\):not\(\.btn-primary\)[\s\S]*?background-color:var\(--lx485-surface-3\)!important/,'non-primary create controls must no longer be black');
  assert.match(css,/\.ta-mobile-sheet\{[\s\S]*?background:#102235!important/,'More sheet must own a visible navy base');
  assert.match(css,/\.ta-mobile-sheet :is\(\.ta-sheet-account,\.ta-sheet-link,\.ta-sheet-theme,\.ta-sheet-theme \.mf-theme-toggle\)[\s\S]*?background:#1a3047!important/,'More sheet items need a distinct elevated layer');
});

test('v485 visibly activates the premium dashboard on iPad and desktop',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/@media screen and \(min-width:901px\)[\s\S]*?\.ta-finance-dashboard/,'desktop dashboard owner is missing');
  assert.match(css,/workspace-shell\.screen-home \.ta-dashboard-header\{[\s\S]*?linear-gradient\(135deg,#18334f 0%,#12283e 52%,#0f2134 100%\)!important/,'desktop hero must use the visible premium surface');
  assert.match(css,/\.lourex-advisor-card\{[\s\S]*?linear-gradient\(145deg,#183149,#12273b\)!important/,'desktop AI card premium treatment is missing');
  assert.match(css,/\.ta-sidebar\{[\s\S]*?linear-gradient\(180deg,#10253a,#0c1b2b\)!important/,'desktop/iPad sidebar must leave the old flat black treatment');
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

test('Batch 5 flattens nested editor controls inside the existing final v485 owner only',async()=>{
  const owner=await read('scripts/v485-bundle-visible-ui.mjs');
  const match=owner.match(/const editorFlatteningGuard=`([\s\S]*?)`;\n\nconst sourceCss=/);
  assert.ok(match,'Batch 5 editor flattening guard must stay inside the existing v485 build owner');
  const css=match[1];
  assert.match(css,/LOUREX Batch 5 — document editor visual flattening/);
  assert.match(css,/\.item-pricing-grid[\s\S]*?background:transparent!important/,'pricing fields must not render as a nested card');
  assert.match(css,/\.item-advanced-fields[\s\S]*?border:0!important[\s\S]*?border-radius:0!important/,'advanced item fields must remain content inside the item surface');
  assert.match(css,/\.appearance-system-grid[\s\S]*?background:transparent!important[\s\S]*?box-shadow:none!important/,'document design must not become a nested panel');
  assert.match(css,/\.watermark-editor-card[\s\S]*?background:transparent!important[\s\S]*?box-shadow:none!important/,'watermark must continue the document-design surface');
  assert.match(css,/min-height:44px!important/,'editor controls must stay touch safe');
  assert.match(css,/@media screen and \(max-width:900px\)[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/,'mobile item fields must collapse without horizontal overflow');
  assert.match(css,/text-align:start!important/,'RTL/LTR must use logical alignment');
  assert.doesNotMatch(css,/@media\s+print|\.invoice-page|\.template-|\.pdf-|\.mobile-editor-actionbar|\.draft-mobile-actionbar/,'Batch 5 must not change printable document output or the fixed editor dock');
});

test('Batch 5 flattening is emitted after the existing v485 visual rules in both production CSS artifacts',async()=>{
  const [bundle,standalone]=await Promise.all([read('dist/styles/app.bundle.css'),read('dist/styles/v482-mobile-ux-repair.css')]);
  const ownerMarker='/* --- v485-visible-ui-corrections.css --- */';
  const batch5Marker='LOUREX Batch 5 — document editor visual flattening';
  for(const [name,content] of [['bundle',bundle],['standalone',standalone]]){
    assert.ok(content.includes(batch5Marker),`${name} is missing Batch 5 editor flattening`);
    assert.ok(content.lastIndexOf(batch5Marker)>content.lastIndexOf(ownerMarker),`${name} must emit Batch 5 inside the final v485 owner`);
    const tail=content.slice(content.lastIndexOf(batch5Marker));
    assert.match(tail,/\.item-pricing-grid[\s\S]*?background:transparent!important/);
    assert.match(tail,/\.watermark-editor-card[\s\S]*?background:transparent!important/);
  }
});

test('styles remain network-first in the PWA so this visual release is not hidden behind an old CSS cache',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/function isAppRuntimePath\(pathname\)[\s\S]*?pathname\.startsWith\('\/styles\/'\)/,'service worker must classify styles as app runtime paths');
  assert.match(sw,/isAppRuntimePath\(url\.pathname\)\)\{event\.respondWith\(networkFirst\(event\.request\)\)/,'app runtime paths must use network-first delivery');
});
