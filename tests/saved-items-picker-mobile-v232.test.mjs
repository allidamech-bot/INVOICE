import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v232 makes the phone Saved Items picker one contained dialog with one scrolling list',async()=>{
  const css=await read('src/styles/saved-items-picker-v232.css');
  assert.match(css,/\.app-ui \.modal:has\(\.saved-items-shell\.is-picker\)>\.modal-body\{[\s\S]*?overflow:hidden!important/);
  assert.match(css,/\.app-ui \.saved-items-shell\.is-picker \.saved-items-list\{[\s\S]*?overflow-y:auto!important/);
  assert.match(css,/\.app-ui \.saved-items-shell\.is-picker \.saved-items-picker-bar\{[\s\S]*?position:relative!important[\s\S]*?display:flex!important[\s\S]*?flex-wrap:wrap!important/);
  assert.match(css,/\.app-ui \.saved-items-shell\.is-picker \.saved-items-picker-bar>div\{[\s\S]*?flex:1 0 100%!important/);
  assert.match(css,/\.app-ui \.saved-items-shell\.is-picker \.saved-items-picker-bar>\.btn\{[\s\S]*?flex:1 1 90px!important[\s\S]*?min-height:44px!important/);
  assert.match(css,/white-space:normal!important/);
});

test('v232 is a late app-only layer and is delivered to installed PWA clients',async()=>{
  const [html,css,patch,distSw,bundle]=await Promise.all([
    read('index.html'),
    read('src/styles/saved-items-picker-v232.css'),
    read('scripts/pwa-cache-v205.mjs'),
    read('dist/sw.js'),
    read('dist/styles/app.bundle.css')
  ]);
  const nested=html.indexOf('./styles/nested-surface-consistency-v229.css');
  const picker=html.indexOf('./styles/saved-items-picker-v232.css');
  const documentCss=html.indexOf('./styles/document-premium-redesign-v141.css');
  assert.ok(nested>=0&&picker>nested&&documentCss>picker,'v232 must load after app closeout and before printable document CSS');
  assert.match(css,/@media screen and \(max-width:720px\)/);
  assert.doesNotMatch(css,/\.invoice-page|\.invoice-pages/);
  assert.match(bundle,/v232 — mobile Saved Items picker containment/);
  assert.match(patch,/\.\/styles\/saved-items-picker-v232\.css/);
  assert.match(patch,/lourex-invoice-v232: saved-items picker containment refresh/);
  assert.match(distSw,/lourex-invoice-v232: saved-items picker containment refresh/);
  assert.match(distSw,/\.\/styles\/saved-items-picker-v232\.css/);
  assert.match(distSw,/lourex-invoice-v231: mobile totals switch geometry refresh/);
});

test('v232 browser QA verifies picker containment at real phone widths in both UI languages',async()=>{
  const visual=await read('tests/visual/run-obsidian-directory.cjs');
  assert.match(visual,/auditMobilePicker/);
  assert.match(visual,/picker modal body must not create a second scroll page/);
  assert.match(visual,/picker list must be the scrolling surface/);
  assert.match(visual,/picker action target clipped or below 44px/);
  assert.match(visual,/picker summary text clipped/);
});
