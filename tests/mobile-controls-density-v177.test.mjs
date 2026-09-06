import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v177 loads after all application mobile recovery layers, before document output, and ships in the active PWA cache',async()=>{
  const [html,sw]=await Promise.all([read('index.html'),read('public/sw.js')]);
  const current='mobile-controls-density-v177.css';
  const doc='document-premium-redesign-v141.css';
  assert.ok(html.indexOf(current)>html.indexOf('mobile-overlap-recovery-v176.css'));
  assert.ok(html.indexOf(doc)>html.indexOf(current));
  const styles=[...html.matchAll(/<link rel="stylesheet" href="\.\/styles\/([^\"]+\.css)" \/>/g)].map(m=>m[1]);
  assert.equal(styles.at(-1),doc);
  assert.match(sw,/^const CACHE = 'lourex-invoice-v177';$/m);
  assert.ok(sw.includes(`./styles/${current}`));
  assert.match(sw,/lourex-invoice-v176: preserved as a legacy marker/);
});

test('v177 establishes a universal 44px coarse-pointer interaction floor without touching document templates',async()=>{
  const css=await read('src/styles/mobile-controls-density-v177.css');
  assert.match(css,/@media \(max-width:960px\) and \(pointer:coarse\)/);
  assert.match(css,/\.app-ui :where\(button,\.btn,\.icon-btn,select,\.input\)/);
  assert.match(css,/\.auth-page :where\(button,\.btn,select,\.input\)/);
  assert.match(css,/min-height:44px!important/);
  assert.match(css,/button\[aria-label\][\s\S]*min-width:44px!important/);
  for(const selector of ['.documents-sort','.section-heading-actions .btn','.editor-top-left>.icon-btn','.mobile-action-buttons .btn','.settings-tabs>button','.product-library-row>.icon-btn','.cloud-account-actions .btn']) assert.ok(css.includes(selector),selector);
  assert.doesNotMatch(css,/\.invoice-page|\.document-page|\.items-table|\.template-(?:executive|minimal|trade|signature|obsidian|cobalt|editorial|split|prism|slate|horizon|mono|aurora|ledger|noir|midnight|blackivory|carbon)/);
});

test('v177 phone touch safety uses explicit selectors for historical compact controls and does not depend on pointer reporting',async()=>{
  const css=await read('src/styles/mobile-controls-density-v177.css');
  const phone=css.slice(css.indexOf('@media (max-width:720px){'),css.indexOf('@media (max-width:360px){'));
  for(const selector of [
    '.app-ui .settings-tabs>button','.app-ui .documents-sort','.app-ui .product-library-star',
    '.app-ui .product-library-row>.icon-btn','.app-ui .cloud-account-actions .btn',
    '.app-ui .saved-items-search-clear','.app-ui .saved-items-quick-filters button',
    '.app-ui .product-library-list-head .btn','.app-ui .product-metadata-suggestions button',
    '.app-ui .segmented button','.app-ui .status-filter button','.app-ui .settings-title>.btn',
    '.app-ui .dashboard-panel-heading>button','.app-ui .editor-top-left>.icon-btn',
    '.app-ui .final-lock-banner .btn','.app-ui .editor-section .input',
    '.app-ui .premium-selected-customer>.btn','.app-ui .recent-customer-row button',
    '.app-ui .item-card-actions .btn','.app-ui .item-card-actions .icon-btn',
    '.app-ui .mobile-action-buttons .btn','.app-ui .template-favorite-button',
    '.app-ui .logo-mode-switch button','.app-ui .logo-rebuild-restore',
    '.app-ui .logo-touch-editor-close','.app-ui .logo-touch-editor-utility button',
    '.auth-page .auth-language-switch','.auth-page .account-entry-tabs button'
  ]) assert.ok(phone.includes(selector),`missing explicit phone fallback for ${selector}`);
  assert.match(phone,/min-height:44px!important/);
  assert.match(phone,/\.app-ui \.product-library-star,[\s\S]*\.app-ui \.logo-touch-editor-close\{[\s\S]*min-width:44px!important/);
  assert.doesNotMatch(phone,/pointer:coarse/);
  assert.doesNotMatch(phone,/\.app-ui :where\(\s*\.settings-tabs>button/);
});

test('v177 browser geometry fixture measures the production CSS bundle and exercises the expanded compact-control set',async()=>{
  const [fixture,runner]=await Promise.all([
    read('tests/visual/mobile-controls-density-v177.html'),
    read('tests/visual/run-mobile-controls-density-v177.cjs')
  ]);
  assert.match(fixture,/href="\.\.\/\.\.\/dist\/styles\/app\.bundle\.css"/);
  assert.doesNotMatch(fixture,/href="\.\.\/\.\.\/src\/styles\//);
  for(const selector of ['saved-items-quick-filters','item-card-actions','template-favorite-button','logo-mode-switch','logo-touch-editor-close']){
    assert.ok(fixture.includes(selector),`fixture missing ${selector}`);
    assert.ok(runner.includes(selector),`runner missing ${selector}`);
  }
  assert.match(runner,/minHeight:s\.minHeight/);
  assert.match(runner,/matchMedia\('\(max-width:720px\)'\)\.matches/);
});

test('v177 keeps narrow headings, forms and tab lanes reachable instead of clipping them',async()=>{
  const css=await read('src/styles/mobile-controls-density-v177.css');
  assert.match(css,/@media \(max-width:720px\)/);
  assert.match(css,/\.page-heading,[\s\S]*\.product-library-commandbar,[\s\S]*\.editor-topbar[\s\S]*min-width:0!important/);
  assert.match(css,/\.settings-tabs,[\s\S]*\.operations-tabs,[\s\S]*\.saved-items-quick-filters,[\s\S]*\.status-filter[\s\S]*overflow-x:auto!important/);
  assert.match(css,/overflow-wrap:anywhere!important/);
  assert.match(css,/overscroll-behavior-inline:contain!important/);
  assert.match(css,/@media \(max-width:360px\)[\s\S]*flex-wrap:wrap!important/);
});
