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

test('mobile picker containment stays print-isolated in the bundled offline app',async()=>{
 const [html,css,patch,sw,bundle]=await Promise.all([read('index.html'),read('src/styles/saved-items-picker-v232.css'),read('scripts/pwa-cache-v205.mjs'),read('dist/sw.js'),read('dist/styles/app.bundle.css')]);
 const picker=html.indexOf('saved-items-picker-v232.css'),paper=html.indexOf('document-premium-redesign-v141.css');
 assert.ok(picker>=0&&paper>=0,'both app-only picker and separate print foundation must be present');
 assert.ok(css.includes('overflow-y:auto!important')&&css.includes('min-height:44px!important'));
 assert.ok(!css.includes('.invoice-page'));
 assert.ok(bundle.includes('saved-items-picker-v232.css'));
 assert.ok(patch.includes('saved-items-picker-v232.css'));
 assert.ok(sw.includes('styles/app.bundle.css'));
});

test('v232 browser QA verifies picker containment at real phone widths in both UI languages',async()=>{
  const visual=await read('tests/visual/run-obsidian-directory.cjs');
  assert.match(visual,/auditMobilePicker/);
  assert.match(visual,/picker modal body must not create a second scroll page/);
  assert.match(visual,/picker list must be the scrolling surface/);
  assert.match(visual,/picker action target clipped or below 44px/);
  assert.match(visual,/picker summary text clipped/);
});
