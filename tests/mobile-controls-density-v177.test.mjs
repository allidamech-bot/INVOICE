import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v351 v177 remains a small safety layer after legacy overlap recovery and before TailAdmin final owners',async()=>{
  const html=await read('index.html');
  const recovery=html.indexOf('mobile-overlap-recovery-v176.css');
  const controls=html.indexOf('mobile-controls-density-v177.css');
  const tailadmin=html.indexOf('tailadmin-finance-v320.css');
  assert.ok(recovery>=0&&controls>recovery&&tailadmin>controls);
});

test('v351 establishes one 44px coarse-pointer floor through iPad Desktop Website widths',async()=>{
  const css=await read('src/styles/mobile-controls-density-v177.css');
  assert.match(css,/@media \(max-width:1366px\) and \(pointer:coarse\)/);
  assert.match(css,/\.app-ui :where\(button,\.btn,\.icon-btn,select,\.input\)/);
  assert.match(css,/min-height:44px!important/);
  assert.match(css,/button\[aria-label\][\s\S]*min-width:44px!important/);
  assert.match(css,/iPadOS Desktop Website/);
  assert.doesNotMatch(css,/max-width:960px\) and \(pointer:coarse/);
});

test('v351 v177 does not own page dock clearance; final reliability owns reachability after TailAdmin page layers',async()=>{
  const [css,reliability,shell]=await Promise.all([
    read('src/styles/mobile-controls-density-v177.css'),
    read('src/styles/tailadmin-reliability-bridge-v320.css'),
    read('src/styles/tailadmin-mobile-header-v322.css')
  ]);
  assert.doesNotMatch(css,/\.ta-finance-dashboard|\.ta-documents-page|\.ta-reports-page/);
  assert.match(shell,/padding-bottom:calc\(92px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
  assert.match(reliability,/\.ta-finance-dashboard,[\s\S]*\.ta-reports-page[\s\S]*padding-bottom:24px!important/);
});

test('v351 narrow headings, forms and tab lanes remain reachable instead of clipping',async()=>{
  const css=await read('src/styles/mobile-controls-density-v177.css');
  const phone=css.slice(css.indexOf('@media (max-width:720px){'),css.indexOf('@media (max-width:360px){'));
  assert.match(phone,/\.page-heading,[\s\S]*\.product-library-commandbar,[\s\S]*\.editor-topbar[\s\S]*min-width:0!important/);
  assert.match(phone,/\.segmented,[\s\S]*\.operations-tabs,[\s\S]*\.saved-items-quick-filters,[\s\S]*\.status-filter[\s\S]*overflow-x:auto!important/);
  assert.match(phone,/overflow-wrap:anywhere!important/);
  assert.match(phone,/overscroll-behavior-inline:contain!important/);
  assert.match(css,/@media \(max-width:360px\)[\s\S]*flex-wrap:wrap!important/);
});

test('v351 v177 stays application-only and never takes ownership of printable A4 templates',async()=>{
  const css=await read('src/styles/mobile-controls-density-v177.css');
  assert.doesNotMatch(css,/\.invoice-page|\.document-page|\.items-table|\.final-details|\.doc-body/);
  assert.match(css,/@media print\{\.app-ui\{display:none!important\}\}/);
});
